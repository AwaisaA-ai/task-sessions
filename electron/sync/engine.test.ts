// @vitest-environment node
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getMeta, openDatabase } from '../db/connection';
import { createSession, listSessions, restoreSession, softDeleteSession } from '../db/sessions';
import {
  applyRemoteSession,
  countDirty,
  getSessionRow,
  getTaskRow,
  markSessionSynced,
  type LocalSessionRow,
  type LocalTaskRow,
} from '../db/syncRepo';
import { createTask, getTask, listTasks, softDeleteTask, toggleTask } from '../db/tasks';
import { LAST_SYNCED_KEY, syncNow } from './engine';
import type { RemoteStore } from './remote';

const OWNER = 'user-1';

/** In-memory stand-in for the two Supabase tables. */
class FakeRemote implements RemoteStore {
  readonly sessions = new Map<string, LocalSessionRow>();
  readonly tasks = new Map<string, LocalTaskRow>();

  async pullSessions(ownerId: string): Promise<LocalSessionRow[]> {
    return [...this.sessions.values()]
      .filter((row) => row.owner_id === ownerId)
      .map((row) => ({ ...row }));
  }

  async pullTasks(ownerId: string): Promise<LocalTaskRow[]> {
    return [...this.tasks.values()]
      .filter((row) => row.owner_id === ownerId)
      .map((row) => ({ ...row }));
  }

  async pushSessions(rows: LocalSessionRow[]): Promise<void> {
    for (const row of rows) this.sessions.set(row.id, { ...row });
  }

  async pushTasks(rows: LocalTaskRow[]): Promise<void> {
    for (const row of rows) this.tasks.set(row.id, { ...row });
  }
}

const AT = {
  first: '2026-11-23T10:00:00.000Z',
  second: '2026-11-23T10:05:00.000Z',
  third: '2026-11-23T10:10:00.000Z',
  fourth: '2026-11-23T10:15:00.000Z',
  fifth: '2026-11-23T10:20:00.000Z',
};

function forceSessionTime(db: DatabaseSync, id: string, iso: string) {
  db.prepare('UPDATE sessions SET updated_at = ?, dirty = 1 WHERE id = ?').run(iso, id);
}

function forceTaskTime(db: DatabaseSync, id: string, iso: string) {
  db.prepare('UPDATE tasks SET updated_at = ?, dirty = 1 WHERE id = ?').run(iso, id);
}

function forceTaskDescription(db: DatabaseSync, id: string, description: string) {
  db.prepare('UPDATE tasks SET description = ?, dirty = 1 WHERE id = ?').run(description, id);
}

describe('sync engine', () => {
  let phone: DatabaseSync;
  let laptop: DatabaseSync;
  let remote: FakeRemote;

  beforeEach(() => {
    phone = openDatabase(':memory:');
    laptop = openDatabase(':memory:');
    remote = new FakeRemote();
  });

  afterEach(() => {
    phone.close();
    laptop.close();
  });

  function sync(db: DatabaseSync, at: string) {
    return syncNow({ db, remote, ownerId: OWNER, now: () => at });
  }

  it('adopts rows created before sign-in and uploads them with the owner', async () => {
    const session = createSession(phone, 'Pre-login notes');
    const task = createTask(phone, { sessionId: session.id, description: 'Written offline' });
    forceSessionTime(phone, session.id, AT.first);
    forceTaskTime(phone, task.id, AT.first);

    expect(getSessionRow(phone, session.id)?.owner_id).toBeNull();
    expect(getTaskRow(phone, task.id)?.owner_id).toBeNull();

    const result = await sync(phone, AT.second);

    expect(result).toMatchObject({ pulled: 0, pushed: 2 });
    expect(getSessionRow(phone, session.id)).toMatchObject({ owner_id: OWNER, dirty: 0 });
    expect(getTaskRow(phone, task.id)).toMatchObject({ owner_id: OWNER, dirty: 0 });
    expect(remote.sessions.get(session.id)).toMatchObject({
      owner_id: OWNER,
      title: 'Pre-login notes',
    });
    expect(getMeta(phone, LAST_SYNCED_KEY)).toBe(AT.second);
  });

  it('converges two devices', async () => {
    const session = createSession(phone, 'Shared plan');
    const task = createTask(phone, { sessionId: session.id, description: 'Buy milk' });
    forceSessionTime(phone, session.id, AT.first);
    forceTaskTime(phone, task.id, AT.first);

    await sync(phone, AT.second);
    const result = await sync(laptop, AT.third);

    expect(result).toMatchObject({ pulled: 2, pushed: 0 });
    expect(listSessions(laptop, { view: 'all' }).map((row) => row.title)).toEqual(['Shared plan']);
    expect(listTasks(laptop, session.id).map((row) => row.description)).toEqual(['Buy milk']);
    expect(countDirty(laptop)).toBe(0);
  });

  it('is a no-op when nothing changed on either side', async () => {
    const session = createSession(phone, 'Quiet');
    forceSessionTime(phone, session.id, AT.first);
    await sync(phone, AT.second);

    expect(await sync(phone, AT.third)).toEqual({ pushed: 0, pulled: 0, conflicts: 0 });
  });

  it('resolves a two-sided edit with last-write-wins', async () => {
    const session = createSession(phone, 'Conflict');
    const task = createTask(phone, { sessionId: session.id, description: 'Original' });
    forceSessionTime(phone, session.id, AT.first);
    forceTaskTime(phone, task.id, AT.first);

    await sync(phone, AT.first);
    await sync(laptop, AT.first);

    // Phone edits at 10:05, laptop edits at 10:10 - the laptop is newer.
    toggleTask(phone, task.id);
    forceTaskTime(phone, task.id, AT.second);
    forceSessionTime(phone, session.id, AT.second);

    forceTaskDescription(laptop, task.id, 'Edited on laptop');
    forceTaskTime(laptop, task.id, AT.third);

    await sync(phone, AT.second);

    // The laptop sees a divergent remote copy, keeps its newer text, and the
    // next sync uploads it.
    const pull = await sync(laptop, AT.third);
    expect(pull.conflicts).toBe(1);
    await sync(laptop, AT.fourth);

    await sync(phone, AT.fifth);
    expect(getTask(phone, task.id)).toMatchObject({
      description: 'Edited on laptop',
      isDone: false,
    });
    expect(remote.tasks.get(task.id)?.description).toBe('Edited on laptop');
  });

  it('propagates a soft delete as a tombstone instead of removing the row', async () => {
    const session = createSession(phone, 'Cleanup');
    const task = createTask(phone, { sessionId: session.id, description: 'Temporary' });
    forceSessionTime(phone, session.id, AT.first);
    forceTaskTime(phone, task.id, AT.first);

    await sync(phone, AT.first);
    await sync(laptop, AT.first);
    expect(listTasks(laptop, session.id)).toHaveLength(1);

    softDeleteTask(phone, task.id);
    phone
      .prepare('UPDATE tasks SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?')
      .run(AT.second, AT.second, task.id);
    forceSessionTime(phone, session.id, AT.second);
    await sync(phone, AT.second);
    await sync(laptop, AT.third);

    expect(listTasks(laptop, session.id)).toHaveLength(0);
    expect(getTaskRow(laptop, task.id)?.deleted_at).toBe(AT.second);
    expect(remote.tasks.get(task.id)?.deleted_at).toBe(AT.second);
  });

  it('syncs a deleted session and lets it be restored on the other device', async () => {
    const session = createSession(phone, 'Undo me');
    forceSessionTime(phone, session.id, AT.first);
    await sync(phone, AT.first);
    await sync(laptop, AT.first);

    softDeleteSession(phone, session.id);
    forceSessionTime(phone, session.id, AT.second);
    await sync(phone, AT.second);
    await sync(laptop, AT.third);

    expect(listSessions(laptop, { view: 'all' })).toHaveLength(0);
    expect(listSessions(laptop, { view: 'archived' })).toHaveLength(1);

    restoreSession(laptop, session.id);
    forceSessionTime(laptop, session.id, AT.fourth);
    await sync(laptop, AT.fourth);
    await sync(phone, AT.fifth);

    expect(listSessions(phone, { view: 'all' })).toHaveLength(1);
  });

  it('rolls the whole pull back when one remote row is corrupt', async () => {
    const good = createSession(laptop, 'Fine');
    forceSessionTime(laptop, good.id, AT.first);
    await sync(laptop, AT.first);

    remote.sessions.set('broken', {
      id: 'broken',
      title: 'Bad row',
      created_at: AT.second,
      updated_at: AT.second,
      // A hand-edited row the CHECK constraint will reject.
      status: 'bogus' as LocalSessionRow['status'],
      deleted_at: null,
      owner_id: OWNER,
      dirty: 0,
      synced_at: null,
    });

    await expect(sync(phone, AT.third)).rejects.toThrow();

    expect(getSessionRow(phone, good.id)).toBeNull();
    expect(getSessionRow(phone, 'broken')).toBeNull();
  });

  it('keeps a row dirty when it changes while the upload is in flight', async () => {
    const session = createSession(phone, 'Racy');
    forceSessionTime(phone, session.id, AT.first);
    await sync(phone, AT.first);

    const row = getSessionRow(phone, session.id);
    expect(row).not.toBeNull();

    // A newer edit lands before the acknowledgement, so the guarded
    // "mark clean" must refuse to clear the flag.
    forceSessionTime(phone, session.id, AT.second);
    expect(markSessionSynced(phone, session.id, row!.updated_at, AT.third)).toBe(false);
    expect(getSessionRow(phone, session.id)?.dirty).toBe(1);

    expect(markSessionSynced(phone, session.id, AT.second, AT.third)).toBe(true);
    expect(getSessionRow(phone, session.id)?.dirty).toBe(0);
  });

  it('does not adopt or upload rows that belong to another account', async () => {
    const session = createSession(phone, 'Other account');
    applyRemoteSession(
      phone,
      {
        id: session.id,
        title: 'Other account',
        created_at: AT.first,
        updated_at: AT.first,
        status: 'active',
        deleted_at: null,
        owner_id: 'someone-else',
        dirty: 0,
        synced_at: null,
      },
      AT.first,
    );

    await sync(phone, AT.second);

    expect(getSessionRow(phone, session.id)?.owner_id).toBe('someone-else');
    expect(remote.sessions.has(session.id)).toBe(false);
  });
});
