import type { SessionStatus } from '../../shared/types';
import styles from './StatusChip.module.css';

const LABELS: Record<SessionStatus, string> = {
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
};

interface StatusChipProps {
  status: SessionStatus;
  deleted?: boolean;
}

/** Status is always spelled out; the dot is decoration only. */
export function StatusChip({ status, deleted = false }: StatusChipProps) {
  return (
    <span className={styles.chip} data-status={status} data-deleted={deleted}>
      <span className={styles.dot} aria-hidden="true" />
      {deleted ? 'Deleted' : LABELS[status]}
    </span>
  );
}
