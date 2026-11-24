import { useEffect } from 'react';

interface ShortcutHandlers {
  onNewSession: () => void;
  onFocusSearch: () => void;
}

/** Ctrl/Cmd+N opens a new session, Ctrl/Cmd+K jumps to search. */
export function useKeyboardShortcuts({ onNewSession, onFocusSearch }: ShortcutHandlers): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        onNewSession();
      } else if (key === 'k') {
        event.preventDefault();
        onFocusSearch();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewSession, onFocusSearch]);
}
