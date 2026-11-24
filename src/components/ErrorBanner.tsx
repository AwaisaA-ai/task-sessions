import styles from './ErrorBanner.module.css';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.message}>{message}</span>
      {onDismiss ? (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
