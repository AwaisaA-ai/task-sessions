// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection';
import {
  createSession,
  listSessions,
  renameSession,
  restoreSession,
  setSessionStatus,
  softDeleteSession,
} from './sessions';
import { createTask, listTasks, softDeleteTask, toggleTask, updateTask } from './tasks';

describe('repositories', () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates sessions with client generated ids and ISO timestamps', () => {
    const session = createSession(db, 'Weekly review');

    expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(session.title).toBe('Weekly review');
    expect(session.status).toBe('active');
    expect(session.deletedAt).toBeNull();
    expect(session.ownerId).toBeNull();
    expect(new Date(session.createdAt).getTime()).not.toBeNaN();
  });

  it('renames a session and bumps updated_at', async () => {
    const session = createSession(db, 'Draft');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const renamed = renameSession(db, session.id, 'Final title');

    expect(renamed.title).toBe('Final title');
    expect(renamed.updatedAt >= session.updatedAt).toBe(true);
  });

  it('filters the list by view', () => {
    const active = createSession(db, 'Active one');
    const completed = createSession(db, 'Completed one');
    setSessionStatus(db, completed.id, 'completed');
    const archived = createSession(db, 'Archived one');
    setSessionStatus(db, archived.id, 'archived');

    expect(listSessions(db, { view: 'all' })).toHaveLength(3);
    expect(listSessions(db, { view: 'active' }).map((s) => s.id)).toEqual([active.id]);
    expect(listSessions(db, { view: 'completed' }).map((s) => s.id)).toEqual([completed.id]);
    expect(listSessions(db, { view: 'archived' }).map((s) => s.id)).toEqual([archived.id]);
  });

  it('hides soft-deleted sessions from every view except archived, and restores them', () => {
    const session = createSession(db, 'Temporary');
    softDeleteSession(db, session.id);

    expect(listSessions(db, { view: 'all' })).toHaveLength(0);
    expect(listSessions(db, { view: 'active' })).toHaveLength(0);

    const archived = listSessions(db, { view: 'archived' });
    expect(archived).toHaveLength(1);
    expect(archived[0]?.deletedAt).not.toBeNull();

    const restored = restoreSession(db, session.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.status).toBe('active');
    expect(listSessions(db, { view: 'active' })).toHaveLength(1);
  });

  it('searches session titles and task descriptions', () => {
    const session = createSession(db, 'Exam prep');
    createTask(db, { sessionId: session.id, description: 'Revise networking chapter' });
    const other = createSession(db, 'Shopping');

    expect(listSessions(db, { view: 'all', query: 'exam' }).map((s) => s.id)).toEqual([session.id]);
    expect(listSessions(db, { view: 'all', query: 'networking' }).map((s) => s.id)).toEqual([
      session.id,
    ]);
    expect(listSessions(db, { view: 'all', query: 'zzz' })).toHaveLength(0);
    expect(other.id).not.toBe(session.id);
  });

  it('keeps session counts in sync with task state', () => {
    const session = createSession(db, 'Counts');
    const first = createTask(db, { sessionId: session.id, description: 'A' });
    createTask(db, { sessionId: session.id, description: 'B' });
    createTask(db, { sessionId: session.id, description: 'C' });

    expect(listSessions(db, { view: 'all' })[0]).toMatchObject({ total: 3, done: 0 });

    toggleTask(db, first.id);
    expect(listSessions(db, { view: 'all' })[0]).toMatchObject({ total: 3, done: 1 });

    softDeleteTask(db, first.id);
    expect(listSessions(db, { view: 'all' })[0]).toMatchObject({ total: 2, done: 0 });
  });

  it('adds tasks in insertion order and toggles them both ways', () => {
    const session = createSession(db, 'Ordering');
    const first = createTask(db, { sessionId: session.id, description: 'First' });
    const second = createTask(db, { sessionId: session.id, description: 'Second' });

    expect(listTasks(db, session.id).map((t) => t.id)).toEqual([first.id, second.id]);
    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);

    const done = toggleTask(db, first.id);
    expect(done.isDone).toBe(true);
    expect(toggleTask(db, first.id).isDone).toBe(false);
  });

  it('updates task text and due dates without touching other fields', () => {
    const session = createSession(db, 'Editing');
    const task = createTask(db, {
      sessionId: session.id,
      description: 'Old text',
      dueDate: '2026-11-30',
    });

    const updated = updateTask(db, { id: task.id, description: 'New text' });
    expect(updated.description).toBe('New text');
    expect(updated.dueDate).toBe('2026-11-30');

    const cleared = updateTask(db, { id: task.id, dueDate: null });
    expect(cleared.dueDate).toBeNull();
    expect(cleared.description).toBe('New text');
  });

  it('refuses writes that violate the schema checks', () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO sessions (id, title, created_at, updated_at) VALUES ('x', '', 'now', 'now')",
        )
        .run(),
    ).toThrow();

    const session = createSession(db, 'Valid');
    expect(() =>
      db
        .prepare(
          "INSERT INTO tasks (id, session_id, description, created_at, updated_at) VALUES ('t', ?, '', 'now', 'now')",
        )
        .run(session.id),
    ).toThrow();
  });

  it('survives a close and reopen (restart persistence)', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'task-sessions-'));
    const file = path.join(directory, 'test.db');

    const first = openDatabase(file);
    const session = createSession(first, 'Persisted');
    const task = createTask(first, { sessionId: session.id, description: 'Remember me' });
    toggleTask(first, task.id);

    first.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    first.close();

    const second = openDatabase(file);
    const tasks = listTasks(second, session.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.isDone).toBe(true);
    expect(listSessions(second, { view: 'all' })[0]?.title).toBe('Persisted');
    second.close();

    fs.rmSync(directory, { recursive: true, force: true });
  });
});
