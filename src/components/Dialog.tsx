import { useEffect, useId, useRef, type ReactNode } from 'react';
import styles from './Dialog.module.css';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}

/**
 * Native <dialog> gives us the focus trap, Esc handling and focus restoration
 * for free, which is what PLAN.md M4 asks for.
 */
export function Dialog({ open, title, description, onClose, children, footer }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    if (open && !node.open) {
      node.showModal();
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  useEffect(() => {
    const node = dialogRef.current;
    if (!node) return;

    function handleCancel(event: Event) {
      event.preventDefault();
      onClose();
    }

    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      {description ? (
        <p id={descriptionId} className={styles.description}>
          {description}
        </p>
      ) : null}
      {children ? <div className={styles.body}>{children}</div> : null}
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </dialog>
  );
}
