import type { SessionSummary } from '../../../shared/types';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { StatusChip } from '../../components/StatusChip';
import { progressFromCounts } from '../../domain/progress';
import { formatRelativeTime } from '../../domain/time';
import styles from './sessions.module.css';

interface SessionRowProps {
  session: SessionSummary;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

export function SessionRow({
  session,
  selected,
  busy,
  onSelect,
  onArchive,
  onRestore,
  onDelete,
}: SessionRowProps) {
  const progress = progressFromCounts(session.total, session.done);
  const isDeleted = session.deletedAt !== null;

  return (
    <li className={styles.row} data-selected={selected}>
      <div className={styles.rowTop}>
        <button
          type="button"
          className={styles.rowButton}
          onClick={onSelect}
          aria-current={selected ? 'true' : undefined}
        >
          <span className={styles.rowTitle}>{session.title}</span>
        </button>
        <StatusChip status={session.status} deleted={isDeleted} />
      </div>

      <ProgressBar
        progress={progress}
        label={`${session.title} progress`}
        size="sm"
        showPercent={false}
      />

      <div className={styles.rowBottom}>
        <p className={styles.rowMeta}>
          {progress.label} ·{' '}
          {isDeleted ? 'Deleted' : `Updated ${formatRelativeTime(session.updatedAt)}`}
        </p>
        <div className={styles.rowActions}>
          {isDeleted || session.status === 'archived' ? (
            <Button size="sm" variant="ghost" onClick={onRestore} disabled={busy}>
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onArchive} disabled={busy}>
              Archive
            </Button>
          )}
          {isDeleted ? null : (
            <Button size="sm" variant="dangerGhost" onClick={onDelete} disabled={busy}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
