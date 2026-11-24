import { useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { errorMessage } from '../../lib/errors';
import fields from '../../styles/fields.module.css';
import styles from './session-detail.module.css';

interface TaskComposerProps {
  onAdd: (input: { description: string; dueDate: string | null }) => Promise<void>;
}

export function TaskComposer({ onAdd }: TaskComposerProps) {
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const trimmed = description.trim();

    if (trimmed.length === 0) {
      setError('Write the task first.');
      descriptionRef.current?.focus();
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onAdd({ description: trimmed, dueDate: dueDate === '' ? null : dueDate });
      setDescription('');
      descriptionRef.current?.focus();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className={fields.field}>
        <label className={fields.label} htmlFor="new-task-description">
          Add a task
        </label>
        <textarea
          id="new-task-description"
          ref={descriptionRef}
          className={fields.textarea}
          rows={2}
          value={description}
          maxLength={1000}
          placeholder="Enter any task....."
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <span className={fields.hint}>Enter adds the task, Shift+Enter starts a new line.</span>
      </div>

      <div className={styles.composerRow}>
        <div className={fields.field}>
          <label className={fields.label} htmlFor="new-task-due">
            Due date (optional)
          </label>
          <input
            id="new-task-due"
            type="date"
            className={fields.input}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Adding…' : 'Add task'}
        </Button>
      </div>

      {error ? (
        <p className={fields.error} role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
