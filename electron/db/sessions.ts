import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  ListSessionsInput,
  Session,
  SessionStatus,
  SessionSummary,
  SessionView,
} from '../../shared/types';
import { nowIso } from './connection';

interface SessionRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: SessionStatus;
  deleted_at: string | null;
  owner_id: string | null;
}

const SELECT_SESSION = `
  SELECT s.*,
    (SELECT COUNT(*) FROM tasks t
       WHERE t.session_id = s.id AND t.deleted_at IS NULL) AS total,
    (SELECT COUNT(*) FROM tasks t
       WHERE t.session_id = s.id AND t.deleted_at IS NULL AND t.is_done = 1) AS done
  FROM sessions s
`;

const VIEW_CLAUSE: Record<SessionView, string> = {
  all: 's.deleted_at IS NULL',
  active: "s.deleted_at IS NULL AND s.status = 'active'",
  completed: "s.deleted_at IS NULL AND s.status = 'completed'",
  // Soft-deleted sessions stay recoverable, so they live in the Archived view.
  archived: "(s.status = 'archived' OR s.deleted_at IS NOT NULL)",
};

export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    deletedAt: row.deleted_at,
    ownerId: row.owner_id,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Every read filters soft-deleted rows except the Archived view, which is the
 * only place a deleted session can be found again.
 */
export function listSessions(db: DatabaseSync, input: ListSessionsInput = {}): SessionSummary[] {
  const view = input.view ?? 'all';
  const query = (input.query ?? '').trim();

  let sql = `${SELECT_SESSION} WHERE ${VIEW_CLAUSE[view]}`;
  const params: string[] = [];

  if (query.length > 0) {
    const like = `%${escapeLike(query)}%`;
    sql += ` AND (s.title LIKE ? ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM tasks t
                 WHERE t.session_id = s.id AND t.deleted_at IS NULL
                 AND t.description LIKE ? ESCAPE '\\'))`;
    params.push(like, like);
  }

  sql += ' ORDER BY s.updated_at DESC';

  const rows = db.prepare(sql).all(...params) as unknown as (SessionRow & {
    total: number;
    done: number;
  })[];

  return rows.map((row) => ({ ...toSession(row), total: row.total, done: row.done }));
}

export function getSession(db: DatabaseSync, id: string): Session {
  const row = db.prepare(`${SELECT_SESSION} WHERE s.id = ?`).get(id) as unknown as
    (SessionRow & { total: number; done: number }) | undefined;

  if (!row) {
    throw new Error(`Session ${id} not found.`);
  }
  return toSession(row);
}

export function createSession(db: DatabaseSync, title: string): Session {
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO sessions (id, title, created_at, updated_at, status, deleted_at, owner_id, dirty)
     VALUES (?, ?, ?, ?, 'active', NULL, NULL, 1)`,
  ).run(id, title, timestamp, timestamp);
  return getSession(db, id);
}

export function renameSession(db: DatabaseSync, id: string, title: string): Session {
  const result = db
    .prepare(
      'UPDATE sessions SET title = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL',
    )
    .run(title, nowIso(), id);

  if (result.changes === 0) {
    throw new Error(`Session ${id} not found.`);
  }
  return getSession(db, id);
}

export function setSessionStatus(db: DatabaseSync, id: string, status: SessionStatus): Session {
  const result = db
    .prepare(
      'UPDATE sessions SET status = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL',
    )
    .run(status, nowIso(), id);

  if (result.changes === 0) {
    throw new Error(`Session ${id} not found.`);
  }
  return getSession(db, id);
}

export function softDeleteSession(db: DatabaseSync, id: string): void {
  const timestamp = nowIso();
  const result = db
    .prepare(
      `UPDATE sessions SET deleted_at = ?, updated_at = ?, dirty = 1
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .run(timestamp, timestamp, id);

  if (result.changes === 0) {
    throw new Error(`Session ${id} not found or already deleted.`);
  }
}

export function restoreSession(db: DatabaseSync, id: string): Session {
  const result = db
    .prepare(
      `UPDATE sessions
       SET deleted_at = NULL, status = 'active', updated_at = ?, dirty = 1
       WHERE id = ?`,
    )
    .run(nowIso(), id);

  if (result.changes === 0) {
    throw new Error(`Session ${id} not found.`);
  }
  return getSession(db, id);
}

/**
 * Keeps the session list ordered by real activity. It also marks the session
 * dirty, because a new `updated_at` is itself a synced change.
 */
export function touchSession(db: DatabaseSync, sessionId: string, timestamp = nowIso()): void {
  db.prepare('UPDATE sessions SET updated_at = ?, dirty = 1 WHERE id = ?').run(
    timestamp,
    sessionId,
  );
}
