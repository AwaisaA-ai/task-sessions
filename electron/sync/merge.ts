/**
 * Last-write-wins merge rule for a single row.
 *
 * The local database is the source of truth for the user, so a local row that
 * has unsynced edits (`dirty`) is only overwritten when the remote copy is
 * strictly newer. Equal timestamps mean "same change" - the remote is not
 * newer, so it must not clobber a local edit that was made in the same
 * millisecond range (two quick toggles, for example).
 */

export type MergeDecision = 'insert' | 'update' | 'skip';

/** Epoch millis for an ISO timestamp; NaN-safe so garbage never wins. */
export function toMillis(iso: string | null | undefined): number {
  if (!iso) return Number.NaN;
  return Date.parse(iso);
}

export interface LocalMergeInput {
  updatedAt: string;
  dirty: boolean;
}

export function decideMerge(local: LocalMergeInput | null, remoteUpdatedAt: string): MergeDecision {
  if (!local) return 'insert';

  const localMs = toMillis(local.updatedAt);
  const remoteMs = toMillis(remoteUpdatedAt);

  // A broken local timestamp must not block the remote row.
  if (Number.isNaN(localMs)) return 'update';
  if (Number.isNaN(remoteMs)) return 'skip';

  if (localMs === remoteMs) return 'skip';
  if (!local.dirty) return 'update';
  return remoteMs > localMs ? 'update' : 'skip';
}
