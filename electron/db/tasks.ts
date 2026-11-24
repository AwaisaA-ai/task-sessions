import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { CreateTaskInput, Task, UpdateTaskInput } from '../../shared/types';
import { nowIso } from './connection';
import { touchSession } from './sessions';

interface TaskRow {
  id: string;
  session_id: string;
  description: string;
  is_done: number;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    sessionId: row.session_id,
    description: row.description,
    isDone: row.is_done === 1,
    dueDate: row.due_date,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function listTasks(db: DatabaseSync, sessionId: string): Task[] {
  const rows = db
    .prepare(
      `SELECT * FROM tasks
       WHERE session_id = ? AND deleted_at IS NULL
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(sessionId) as unknown as TaskRow[];

  return rows.map(toTask);
}

export function getTask(db: DatabaseSync, id: string): Task {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as
    TaskRow | undefined;

  if (!row) {
    throw new Error(`Task ${id} not found.`);
  }
  return toTask(row);
}

export function createTask(db: DatabaseSync, input: CreateTaskInput): Task {
  const id = randomUUID();
  const timestamp = nowIso();

  const nextOrder = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM tasks WHERE session_id = ?')
    .get(input.sessionId) as { next: number } | undefined;

  // Copy the owner from the session so a task can be pushed even if the
  // session row happens to be skipped as "already clean".
  const owner = db.prepare('SELECT owner_id FROM sessions WHERE id = ?').get(input.sessionId) as
    { owner_id: string | null } | undefined;

  db.prepare(
    `INSERT INTO tasks
       (id, session_id, description, is_done, due_date, sort_order, created_at, updated_at,
        deleted_at, owner_id, dirty)
     VALUES (?, ?, ?, 0, ?, ?, ?, ?, NULL, ?, 1)`,
  ).run(
    id,
    input.sessionId,
    input.description,
    input.dueDate ?? null,
    nextOrder?.next ?? 0,
    timestamp,
    timestamp,
    owner?.owner_id ?? null,
  );

  touchSession(db, input.sessionId, timestamp);
  return getTask(db, id);
}

export function updateTask(db: DatabaseSync, input: UpdateTaskInput): Task {
  const existing = getTask(db, input.id);
  const timestamp = nowIso();

  db.prepare(
    `UPDATE tasks
     SET description = ?, due_date = ?, updated_at = ?, dirty = 1
     WHERE id = ? AND deleted_at IS NULL`,
  ).run(
    input.description ?? existing.description,
    input.dueDate === undefined ? existing.dueDate : input.dueDate,
    timestamp,
    input.id,
  );

  touchSession(db, existing.sessionId, timestamp);
  return getTask(db, input.id);
}

export function toggleTask(db: DatabaseSync, id: string): Task {
  const timestamp = nowIso();

  const result = db
    .prepare(
      `UPDATE tasks
       SET is_done = CASE is_done WHEN 0 THEN 1 ELSE 0 END, updated_at = ?, dirty = 1
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(timestamp, id);

  if (result.changes === 0) {
    throw new Error(`Task ${id} not found.`);
  }

  const task = getTask(db, id);
  touchSession(db, task.sessionId, timestamp);
  return task;
}

export function softDeleteTask(db: DatabaseSync, id: string): void {
  const task = getTask(db, id);
  const timestamp = nowIso();

  const result = db
    .prepare(
      `UPDATE tasks SET deleted_at = ?, updated_at = ?, dirty = 1
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(timestamp, timestamp, id);

  if (result.changes === 0) {
    throw new Error(`Task ${id} not found or already deleted.`);
  }

  touchSession(db, task.sessionId, timestamp);
}
