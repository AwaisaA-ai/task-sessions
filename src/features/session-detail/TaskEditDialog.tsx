import { useEffect, useState, type FormEvent } from 'react';
import type { Task } from '../../../shared/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { errorMessage } from '../../lib/errors';
import fields from '../../styles/fields.module.css';

interface TaskEditDialogProps {
  task: Task | null;
  onClose: () => void;
  onSave: (values: { description: string; dueDate: string | null }) => Promise<void>;
}

export function TaskEditDialog({ task, onClose, onSave }: TaskEditDialogProps) {
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setDescription(task.description);
      setDueDate(task.dueDate ?? '');
      setError('');
    }
  }, [task]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = description.trim();

    if (trimmed.length === 0) {
      setError('The task needs a description.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await onSave({ description: trimmed, dueDate: dueDate === '' ? null : dueDate });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={task !== null}
      title="Edit task"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="edit-task-form" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <form id="edit-task-form" onSubmit={handleSubmit} noValidate>
        <div className={fields.field}>
          <label className={fields.label} htmlFor="edit-task-description">
            Task description
          </label>
          <textarea
            id="edit-task-description"
            className={fields.textarea}
            rows={3}
            value={description}
            maxLength={1000}
            onChange={(event) => setDescription(event.target.value)}
            autoFocus
          />
        </div>

        <div className={fields.field} style={{ marginTop: '0.9rem' }}>
          <label className={fields.label} htmlFor="edit-task-due">
            Due date (optional)
          </label>
          <input
            id="edit-task-due"
            type="date"
            className={fields.input}
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>

        {error ? (
          <p className={fields.error} role="alert" style={{ marginTop: '0.6rem' }}>
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
