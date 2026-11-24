import type { DatabaseSync } from 'node:sqlite';
import type { SessionStatus } from '../../shared/types';

/**
 * Sync-specific SQL. Kept out of `sessions.ts` / `tasks.ts` so the normal
 * repositories stay about the UI's needs, and so every query the sync engine
 * can run is listed in one place.
 */

export interface LocalSessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: SessionStatus;
  deleted_at: string | null;
  owner_id: string | null;
  dirty: number;
  synced_at: string | null;
}

export interface LocalTaskRow {
  id: string;
  session_id: string;
  description: string;
  is_done: number;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  owner_id: string | null;
  dirty: number;
  synced_at: string | null;
}

export function listDirtySessions(db: DatabaseSync): LocalSessionRow[] {
  return db.prepare('SELECT * FROM sessions WHERE dirty = 1').all() as unknown as LocalSessionRow[];
}

export function listDirtyTasks(db: DatabaseSync): LocalTaskRow[] {
  return db.prepare('SELECT * FROM tasks WHERE dirty = 1').all() as unknown as LocalTaskRow[];
}

export function getSessionRow(db: DatabaseSync, id: string): LocalSessionRow | null {
  const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as unknown as
    LocalSessionRow | undefined;
  return row ?? null;
}

export function getTaskRow(db: DatabaseSync, id: string): LocalTaskRow | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as unknown as
    LocalTaskRow | undefined;
  return row ?? null;
}

/**
 * Clears `dirty` only if the row is exactly the version that was pushed. A user
 * edit during the push changes `updated_at`, so the guard fails and the next
 * sync sends the newer version. Returns true when the row was marked clean.
 */
export function markSessionSynced(
  db: DatabaseSync,
  id: string,
  expectedUpdatedAt: string,
  syncedAt: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE sessions SET dirty = 0, synced_at = ?
       WHERE id = ? AND updated_at = ? AND dirty = 1`,
    )
    .run(syncedAt, id, expectedUpdatedAt);
  return result.changes > 0;
}

export function markTaskSynced(
  db: DatabaseSync,
  id: string,
  expectedUpdatedAt: string,
  syncedAt: string,
): boolean {
  const result = db
    .prepare(
      `UPDATE tasks SET dirty = 0, synced_at = ?
       WHERE id = ? AND updated_at = ? AND dirty = 1`,
    )
    .run(syncedAt, id, expectedUpdatedAt);
  return result.changes > 0;
}

/**
 * Applies a remote session. Remote always wins here - the merge decision was
 * made before calling this, and the pulled row is authoritative.
 */
export function applyRemoteSession(db: DatabaseSync, row: LocalSessionRow, syncedAt: string): void {
  db.prepare(
    `INSERT INTO sessions
       (id, title, created_at, updated_at, status, deleted_at, owner_id, dirty, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       updated_at = excluded.updated_at,
       status = excluded.status,
       deleted_at = excluded.deleted_at,
       owner_id = excluded.owner_id,
       dirty = 0,
       synced_at = excluded.synced_at`,
  ).run(
    row.id,
    row.title,
    row.created_at,
    row.updated_at,
    row.status,
    row.deleted_at,
    row.owner_id,
    syncedAt,
  );
}

export function applyRemoteTask(db: DatabaseSync, row: LocalTaskRow, syncedAt: string): void {
  db.prepare(
    `INSERT INTO tasks
       (id, session_id, description, is_done, due_date, sort_order, created_at, updated_at,
        deleted_at, owner_id, dirty, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       session_id = excluded.session_id,
       description = excluded.description,
       is_done = excluded.is_done,
       due_date = excluded.due_date,
       sort_order = excluded.sort_order,
       updated_at = excluded.updated_at,
       deleted_at = excluded.deleted_at,
       owner_id = excluded.owner_id,
       dirty = 0,
       synced_at = excluded.synced_at`,
  ).run(
    row.id,
    row.session_id,
    row.description,
    row.is_done,
    row.due_date,
    row.sort_order,
    row.created_at,
    row.updated_at,
    row.deleted_at,
    row.owner_id,
    syncedAt,
  );
}

/**
 * First sign-in on a machine: every pre-existing local row is now owned by this
 * account and queued for upload. Rows already owned by somebody else are left
 * alone, so signing in on a shared profile never reassigns another account's
 * data.
 */
export function adoptLocalRows(db: DatabaseSync, ownerId: string): number {
  const sessions = db
    .prepare('UPDATE sessions SET owner_id = ?, dirty = 1 WHERE owner_id IS NULL')
    .run(ownerId);
  const tasks = db
    .prepare('UPDATE tasks SET owner_id = ?, dirty = 1 WHERE owner_id IS NULL')
    .run(ownerId);

  return Number(sessions.changes) + Number(tasks.changes);
}

export function countDirty(db: DatabaseSync): number {
  const sessions = db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE dirty = 1').get() as {
    n: number;
  };
  const tasks = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE dirty = 1').get() as {
    n: number;
  };
  return sessions.n + tasks.n;
}
