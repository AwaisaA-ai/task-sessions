import { useCallback, useRef, useState } from 'react';
import type { Session, SessionView, SyncStatus } from '../shared/types';
import { Button } from './components/Button';
import { EmptyState } from './components/EmptyState';
import { useAutoSync, useSyncStatus, useSyncSignOut, useSyncRun } from './db/sync';
import { useSessions } from './db/queries';
import { useKeyboardShortcuts } from './a11y/useKeyboardShortcuts';
import { useAppSettings } from './lib/appSettings';
import { useDebouncedValue } from './lib/useDebouncedValue';
import { SessionDetail } from './features/session-detail/SessionDetail';
import { NewSessionDialog } from './features/sessions/NewSessionDialog';
import { SessionList } from './features/sessions/SessionList';
import { SettingsDialog } from './features/settings/SettingsDialog';
import { SyncDialog } from './features/sync/SyncDialog';
import { SyncPanel } from './features/sync/SyncPanel';
import { OnboardingBanner } from './features/sync/OnboardingBanner';
import styles from './App.module.css';

const FALLBACK_STATUS: SyncStatus = {
  configured: false,
  user: null,
  state: 'local-only',
  lastSyncedAt: null,
  message: null,
};

export function App() {
  const [view, setView] = useState<SessionView>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newSessionOpen, setNewSessionOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(true);

  const searchRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const { settings, setTheme, setReducedMotion } = useAppSettings();

  const sessionsQuery = useSessions({ view, query: debouncedQuery });
  const syncStatus = useSyncStatus();
  const syncRun = useSyncRun();
  const signOut = useSyncSignOut();

  useAutoSync();

  const openNewSession = useCallback(() => setNewSessionOpen(true), []);
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const openSyncDialog = useCallback(() => setSyncOpen(true), []);
  const closeSyncDialog = useCallback(() => setSyncOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeOnboarding = useCallback(() => setOnboardingOpen(false), []);

  useKeyboardShortcuts({ onNewSession: openNewSession, onFocusSearch: focusSearch });

  function handleCreated(session: Session) {
    setNewSessionOpen(false);
    setView('all');
    setQuery('');
    setSelectedId(session.id);
  }

  const status: SyncStatus = syncStatus.data ?? FALLBACK_STATUS;

  return (
    <div className={styles.app}>
      <OnboardingBanner open={onboardingOpen} onClose={closeOnboarding} />

      <div className={styles.body}>
        <aside className={styles.sidebar} aria-label="Sessions">
          <div className={styles.sidebarList}>
            <SessionList
              sessions={sessionsQuery.data ?? []}
              isLoading={sessionsQuery.isLoading}
              isError={sessionsQuery.isError}
              view={view}
              query={query}
              selectedId={selectedId}
              searchRef={searchRef}
              onViewChange={setView}
              onQueryChange={setQuery}
              onSelect={setSelectedId}
              onNewSession={openNewSession}
              onOpenSettings={openSettings}
            />
          </div>

          <div className={styles.sidebarFooter}>
            <SyncPanel
              status={status}
              onConfigure={openSyncDialog}
              onSignIn={() => setSyncOpen(true)}
              onSignUp={() => setSyncOpen(true)}
              onSignOut={() => void signOut.mutateAsync()}
              onSyncNow={() => void syncRun.mutateAsync()}
            />
          </div>
        </aside>

        <main className={styles.main}>
          {selectedId ? (
            <SessionDetail sessionId={selectedId} />
          ) : (
            <EmptyState
              title="Pick a session, or start a new one"
              description="Each session holds its own tasks, and the progress bar updates the moment you tick something off. Everything is stored locally on this machine."
              action={
                <Button variant="primary" onClick={openNewSession}>
                  New session
                </Button>
              }
            />
          )}
        </main>
      </div>

      <NewSessionDialog
        open={newSessionOpen}
        onClose={() => setNewSessionOpen(false)}
        onCreated={handleCreated}
      />

      <SyncDialog open={syncOpen} status={status} onClose={closeSyncDialog} />

      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        onThemeChange={setTheme}
        onReducedMotionChange={setReducedMotion}
        onClose={closeSettings}
      />
    </div>
  );
}
