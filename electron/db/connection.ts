import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite lives in the main process only. The renderer never touches the
 * filesystem or the database directly (see PLAN.md section 8 guardrails).
 *
 * `node:sqlite` is built into the Electron/Node runtime, so there is no native
 * module to compile - which keeps `npm install` working on machines without a
 * C++ toolchain.
 */

export const SCHEMA_VERSION = 2;

/** DDL from PLAN.md section 3, verbatim. */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'
             CHECK(status IN ('active','completed','archived')),
  deleted_at TEXT,
  owner_id   TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 1000),
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK(is_done IN (0,1)),
  due_date    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_session
  ON tasks(session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_status
  ON sessions(status) WHERE deleted_at IS NULL;
`;

/**
 * v2 adds the sync bookkeeping. Nothing in v1 changes shape, so an existing
 * database keeps working: the columns are additive and default to "clean".
 *
 * - `dirty = 1` means "this row changed locally and must be pushed".
 * - `synced_at` records the last successful sync that involved the row.
 * - `owner_id` on tasks lets a task be pushed before its session exists on the
 *   remote side without guessing the owner.
 * - `app_meta` is a small key/value store for things like `last_synced_at`.
 */
const MIGRATION_2_SQL = `
ALTER TABLE sessions ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sessions ADD COLUMN synced_at TEXT;
ALTER TABLE tasks ADD COLUMN owner_id TEXT;
ALTER TABLE tasks ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN synced_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_dirty ON sessions(dirty) WHERE dirty = 1;
CREATE INDEX IF NOT EXISTS idx_tasks_dirty ON tasks(dirty) WHERE dirty = 1;

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * Opens (and creates) the database, applies PRAGMAs and migrations.
 * Pass ':memory:' in tests to get a throwaway database.
 */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }

  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 2000;');
  migrate(db);
  return db;
}

function currentVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version;').get() as { user_version?: number } | undefined;
  return row?.user_version ?? 0;
}

function migrate(db: DatabaseSync): void {
  const version = currentVersion(db);
  if (version >= SCHEMA_VERSION) return;

  db.exec('BEGIN IMMEDIATE;');
  try {
    if (version < 1) {
      db.exec(SCHEMA_SQL);
    }
    if (version < 2) {
      db.exec(MIGRATION_2_SQL);
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }
}

/** ISO-8601 UTC with millisecond precision, the format stored in every row. */
export function nowIso(): string {
  return new Date().toISOString();
}

export function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}
