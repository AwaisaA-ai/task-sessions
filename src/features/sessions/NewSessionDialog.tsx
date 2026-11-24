import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '../../../shared/types';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useCreateSession } from '../../db/queries';
import { errorMessage } from '../../lib/errors';
import fields from '../../styles/fields.module.css';

interface NewSessionDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (session: Session) => void;
}

export function NewSessionDialog({ open, onClose, onCreated }: NewSessionDialogProps) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const createSession = useCreateSession();

  useEffect(() => {
    if (open) {
      setTitle('');
      setError('');
    }
  }, [open]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (title.trim().length === 0) {
      setError('Give the session a name first.');
      return;
    }

    setError('');
    try {
      const session = await createSession.mutateAsync({ title });
      onCreated(session);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <Dialog
      open={open}
      title="New session"
      description="A session groups the tasks for one piece of work."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="new-session-form"
            disabled={createSession.isPending}
          >
            {createSession.isPending ? 'Creating…' : 'Create session'}
          </Button>
        </>
      }
    >
      <form id="new-session-form" onSubmit={handleSubmit} noValidate>
        <div className={fields.field}>
          <label className={fields.label} htmlFor="new-session-title">
            Session name
          </label>
          <input
            id="new-session-title"
            className={fields.input}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            placeholder="Weekly review"
            autoFocus
            required
          />
        </div>
        {error ? (
          <p className={fields.error} role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
