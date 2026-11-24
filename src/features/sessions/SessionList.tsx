import { useState, type RefObject } from 'react';
import type { SessionSummary, SessionView } from '../../../shared/types';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { useDeleteSession, useRestoreSession, useSetSessionStatus } from '../../db/queries';
import { errorMessage } from '../../lib/errors';
import { SessionFilters, countLabel } from './SessionFilters';
import { SessionRow } from './SessionRow';
import styles from './sessions.module.css';

type PendingAction = { kind: 'archive' | 'delete'; session: SessionSummary } | null;

interface SessionListProps {
  sessions: SessionSummary[];
  isLoading: boolean;
  isError: boolean;
  view: SessionView;
  query: string;
  selectedId: string | null;
  searchRef: RefObject<HTMLInputElement>;
  onViewChange: (view: SessionView) => void;
  onQueryChange: (query: string) => void;
  onSelect: (id: string) => void;
  onNewSession: () => void;
  onOpenSettings: () => void;
}

const CONFIRM_COPY = {
  archive: {
    title: 'Archive this session?',
    description:
      'Archived sessions leave the All and Active lists. You can restore them from the Archived filter at any time.',
    confirmLabel: 'Archive session',
    destructive: false,
  },
  delete: {
    title: 'Delete this session?',
    description:
      'The session and its tasks are kept recoverable: it moves to the Archived filter, where you can restore it.',
    confirmLabel: 'Delete session',
    destructive: true,
  },
} as const;

export function SessionList({
  sessions,
  isLoading,
  isError,
  view,
  query,
  selectedId,
  searchRef,
  onViewChange,
  onQueryChange,
  onSelect,
  onNewSession,
  onOpenSettings,
}: SessionListProps) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const setStatus = useSetSessionStatus();
  const removeSession = useDeleteSession();
  const restoreSession = useRestoreSession();

  async function runAction(sessionId: string, action: () => Promise<unknown>) {
    setBusyId(sessionId);
    setError('');
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmPending() {
    if (!pending) return;

    const { kind, session } = pending;
    await runAction(session.id, () =>
      kind === 'delete'
        ? removeSession.mutateAsync(session.id)
        : setStatus.mutateAsync({ id: session.id, status: 'archived' }),
    );
    setPending(null);
  }

  const emptyCopy =
    query.trim().length > 0
      ? {
          title: 'No sessions match that search',
          description: 'Try a different word, or clear the search field to see everything.',
        }
      : view === 'archived'
        ? {
            title: 'Nothing archived yet',
            description: 'Archived and deleted sessions land here so they stay recoverable.',
          }
        : {
            title: 'No sessions yet',
            description: 'Create a session for the piece of work you are on, then add tasks to it.',
          };

  return (
    <div className={styles.list}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.heading}>Task Sessions</h1>
          <p className={styles.subheading}>{isLoading ? 'Loading…' : countLabel(sessions)}</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="primary" onClick={onNewSession}>
            New session
          </Button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={onOpenSettings}
            aria-label="Open settings"
            title="Settings"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      <SessionFilters
        view={view}
        query={query}
        searchRef={searchRef}
        onViewChange={onViewChange}
        onQueryChange={onQueryChange}
      />

      {error ? <ErrorBanner message={error} onDismiss={() => setError('')} /> : null}
      {isError ? (
        <ErrorBanner message="The session list could not be loaded from the database." />
      ) : null}

      {isLoading ? (
        <p className={styles.status} role="status">
          Loading sessions…
        </p>
      ) : null}

      {!isLoading && !isError && sessions.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyState title={emptyCopy.title} description={emptyCopy.description} />
        </div>
      ) : null}

      <ul className={styles.items} aria-busy={isLoading}>
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            selected={session.id === selectedId}
            busy={busyId === session.id}
            onSelect={() => onSelect(session.id)}
            onArchive={() => setPending({ kind: 'archive', session })}
            onRestore={() =>
              void runAction(session.id, () => restoreSession.mutateAsync(session.id))
            }
            onDelete={() => setPending({ kind: 'delete', session })}
          />
        ))}
      </ul>

      <ConfirmDialog
        open={pending !== null}
        title={pending ? CONFIRM_COPY[pending.kind].title : ''}
        description={pending ? CONFIRM_COPY[pending.kind].description : ''}
        confirmLabel={pending ? CONFIRM_COPY[pending.kind].confirmLabel : ''}
        destructive={pending ? CONFIRM_COPY[pending.kind].destructive : false}
        busy={busyId !== null}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
