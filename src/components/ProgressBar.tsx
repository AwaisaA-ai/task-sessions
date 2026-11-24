import type { Progress } from '../domain/progress';
import styles from './ProgressBar.module.css';

interface ProgressBarProps {
  progress: Progress;
  /** Accessible name; include the session title, e.g. "Weekly review progress". */
  label: string;
  size?: 'sm' | 'lg';
  showPercent?: boolean;
}

/**
 * Native <progress>, never a styled div: screen readers get value/max for free.
 */
export function ProgressBar({
  progress,
  label,
  size = 'lg',
  showPercent = true,
}: ProgressBarProps) {
  return (
    <div
      className={styles.wrapper}
      data-size={size}
      data-complete={progress.total > 0 && progress.percent === 100}
    >
      <progress className={styles.bar} max={100} value={progress.percent} aria-label={label} />
      {showPercent ? (
        <span className={styles.percent} aria-hidden="true">
          {progress.percent}%
        </span>
      ) : null}
    </div>
  );
}
