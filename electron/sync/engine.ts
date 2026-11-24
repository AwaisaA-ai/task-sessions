import type { DatabaseSync } from 'node:sqlite';
import type { SyncRunResult } from '../../shared/types';
import { nowIso, setMeta } from '../db/connection';
import {
  adoptLocalRows,
  applyRemoteSession,
  applyRemoteTask,
  getSessionRow,
  getTaskRow,
  listDirtySessions,
  listDirtyTasks,
  markSessionSynced,
  markTaskSynced,
} from '../db/syncRepo';
import { decideMerge } from './merge';
import type { RemoteStore } from './remote';

/** `app_meta` key holding the last successful sync timestamp. */
export const LAST_SYNCED_KEY = 'last_synced_at';

export interface SyncEngineInput {
  db: DatabaseSync;
  remote: RemoteStore;
  ownerId: string;
  /** Injectable clock so tests can produce exact timestamps. */
  now?: () => string;
}

/**
 * One full sync round:
 *
 *   adopt local rows -> pull -> merge -> push dirty -> mark clean
 *
 * Pull happens before push so a remote change is never overwritten by a stale
 * local copy that merely looked dirty. `decideMerge` is the only place the
 * last-write-wins rule lives.
 */
export async function syncNow({
  db,
  remote,
  ownerId,
  now = nowIso,
}: SyncEngineInput): Promise<SyncRunResult> {
  const syncedAt = now();

  // Rows created while signed out (or before the first sign-in) belong to
  // whoever is signing in now.
  adoptLocalRows(db, ownerId);

  let pulled = 0;
  let conflicts = 0;

  const [remoteSessions, remoteTasks] = await Promise.all([
    remote.pullSessions(ownerId),
    remote.pullTasks(ownerId),
  ]);

  // Apply the whole pull atomically: a half-applied snapshot would be worse
  // than no sync at all.
  db.exec('BEGIN IMMEDIATE;');
  try {
    for (const row of remoteSessions) {
      const local = getSessionRow(db, row.id);
      const decision = decideMerge(
        local ? { updatedAt: local.updated_at, dirty: local.dirty === 1 } : null,
        row.updated_at,
      );

      if (decision === 'skip') {
        if (local && local.dirty === 1 && local.updated_at !== row.updated_at) {
          conflicts += 1;
        }
        continue;
      }

      applyRemoteSession(db, row, syncedAt);
      pulled += 1;
    }

    for (const row of remoteTasks) {
      const local = getTaskRow(db, row.id);
      const decision = decideMerge(
        local ? { updatedAt: local.updated_at, dirty: local.dirty === 1 } : null,
        row.updated_at,
      );

      if (decision === 'skip') {
        if (local && local.dirty === 1 && local.updated_at !== row.updated_at) {
          conflicts += 1;
        }
        continue;
      }

      // A task can only exist locally if its session does; the session pull
      // above guarantees that for rows created by another device.
      if (!getSessionRow(db, row.session_id)) continue;

      applyRemoteTask(db, row, syncedAt);
      pulled += 1;
    }

    db.exec('COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK;');
    throw error;
  }

  let pushed = 0;

  // Sessions first: tasks carry a foreign key to them on the Supabase side.
  const dirtySessions = listDirtySessions(db).filter((row) => row.owner_id === ownerId);
  if (dirtySessions.length > 0) {
    await remote.pushSessions(dirtySessions);
    for (const row of dirtySessions) {
      if (markSessionSynced(db, row.id, row.updated_at, syncedAt)) pushed += 1;
    }
  }

  const dirtyTasks = listDirtyTasks(db).filter((row) => row.owner_id === ownerId);
  if (dirtyTasks.length > 0) {
    await remote.pushTasks(dirtyTasks);
    for (const row of dirtyTasks) {
      if (markTaskSynced(db, row.id, row.updated_at, syncedAt)) pushed += 1;
    }
  }

  setMeta(db, LAST_SYNCED_KEY, syncedAt);

  return { pushed, pulled, conflicts };
}
