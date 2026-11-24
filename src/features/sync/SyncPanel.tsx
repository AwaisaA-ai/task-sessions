import { Button } from '../../components/Button';
import type { SyncStatus } from '../../../shared/types';

interface SyncPanelProps {
  status: SyncStatus;
  onConfigure: () => void;
  onSignIn: () => void;
  onSignUp: () => void;
  onSignOut: () => void;
  onSyncNow: () => void;
}

function lastSyncedLabel(status: SyncStatus): string {
  if (!status.lastSyncedAt) return 'never synced';
  const then = new Date(status.lastSyncedAt).getTime();
  if (Number.isNaN(then)) return 'never synced';

  const minutes = Math.floor((Date.now() - then) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return 'yesterday';
}

/**
 * Sidebar footer status. Shows the offline-first truth at a glance: no cloud
 * config means the user is fully offline-capable; with config it offers the
 * optional sign-in / sync flow.
 */
export function SyncPanel({
  status,
  onConfigure,
  onSignIn,
  onSignUp,
  onSignOut,
  onSyncNow,
}: SyncPanelProps) {
  const signedIn = status.user !== null;

  let title: string;
  let body: string | null;
  let tone: 'ok' | 'warn' | 'info';

  if (!status.configured) {
    title = 'Offline mode';
    body =
      'No cloud project is connected. The app works fully offline — and online — with your data staying local.';
    tone = 'info';
  } else if (!signedIn) {
    title = 'Cloud sync off';
    body =
      'Connect a Supabase project and sign in to mirror your sessions. Everything stays on this device first.';
    tone = 'warn';
  } else if (status.state === 'syncing') {
    title = 'Syncing…';
    body = 'Uploading and downloading your sessions. Local data is never touched.';
    tone = 'info';
  } else if (status.state === 'error') {
    title = 'Sync paused';
    body = status.message ?? 'The last sync attempt failed. Changes stay local and will retry.';
    tone = 'warn';
  } else {
    title = `Synced ${lastSyncedLabel(status)}`;
    body = status.user ? `Signed in as ${status.user.email ?? status.user.id}.` : null;
    tone = 'ok';
  }

  const syncing = status.state === 'syncing';
  return (
    <section className="syncPanel" data-tone={tone}>
      <p className="syncPanelTitle">{title}</p>
      {body ? <p className="syncPanelBody">{body}</p> : null}

      <div className="syncPanelActions">
        {status.configured && !signedIn ? (
          <>
            <Button size="sm" variant="secondary" onClick={onSignIn}>
              Sign in
            </Button>
            <Button size="sm" variant="ghost" onClick={onSignUp}>
              Create account
            </Button>
          </>
        ) : null}

        {signedIn ? (
          <>
            <Button size="sm" variant="secondary" onClick={onSyncNow} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button size="sm" variant="ghost" onClick={onSignOut}>
              Sign out
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={onConfigure}>
            {status.configured ? 'Change cloud project' : 'Set up cloud sync'}
          </Button>
        )}
      </div>
    </section>
  );
}
