import type { RefObject } from 'react';
import type { SessionSummary, SessionView } from '../../../shared/types';
import styles from './sessions.module.css';

const FILTERS: { value: SessionView; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

interface SessionFiltersProps {
  view: SessionView;
  query: string;
  searchRef: RefObject<HTMLInputElement>;
  onViewChange: (view: SessionView) => void;
  onQueryChange: (query: string) => void;
}

export function SessionFilters({
  view,
  query,
  searchRef,
  onViewChange,
  onQueryChange,
}: SessionFiltersProps) {
  return (
    <div className={styles.controls}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="session-search">
          Search sessions
        </label>
        <input
          id="session-search"
          ref={searchRef}
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Title or task text…"
        />
      </div>

      <div className={styles.filters} role="group" aria-label="Filter sessions by status">
        {FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={styles.filter}
            aria-pressed={view === filter.value}
            onClick={() => onViewChange(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function countLabel(sessions: SessionSummary[]): string {
  return sessions.length === 1 ? '1 session' : `${sessions.length} sessions`;
}
