import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { useSyncConfigure, useSyncSignIn, useSyncSignUp } from '../../db/sync';
import { errorMessage } from '../../lib/errors';
import fields from '../../styles/fields.module.css';
import type { SyncStatus } from '../../../shared/types';

interface SyncDialogProps {
  open: boolean;
  status: SyncStatus;
  onClose: () => void;
}

const EMPTY_CONFIG = { url: '', anonKey: '' };

/**
 * Optional cloud setup: Supabase project credentials first, then email /
 * password sign-in (or sign-up). Everything is optional - the dialog is only
 * reachable from the sidebar sync panel.
 */
export function SyncDialog({ open, status, onClose }: SyncDialogProps) {
  const [step, setStep] = useState<'config' | 'auth'>('config');
  const [url, setUrl] = useState(EMPTY_CONFIG.url);
  const [anonKey, setAnonKey] = useState(EMPTY_CONFIG.anonKey);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const configure = useSyncConfigure();
  const signIn = useSyncSignIn();
  const signUp = useSyncSignUp();

  useEffect(() => {
    if (open) {
      setStep(status.configured ? 'auth' : 'config');
      setError('');
      setNotice('');
      setPassword('');
    }
  }, [open, status.configured]);

  function reset() {
    setUrl(EMPTY_CONFIG.url);
    setAnonKey(EMPTY_CONFIG.anonKey);
    setEmail('');
    setPassword('');
    setError('');
    setNotice('');
  }

  function close() {
    onClose();
    reset();
  }

  async function handleConfigure(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    try {
      await configure.mutateAsync({ url, anonKey });
      setStep('auth');
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function handleAuthSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setNotice('');

    try {
      if (step === 'auth') {
        const result = await signIn.mutateAsync({ email, password });
        if (result.state === 'error') {
          setError(result.message ?? 'The sign-in failed.');
          return;
        }
      } else {
        const result = await signUp.mutateAsync({ email, password });
        if (result.requiresEmailConfirmation) {
          setNotice('Account created. Confirm the email in the Supabase dashboard, then sign in.');
        }
      }
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <Dialog
      open={open}
      title="Cloud sync"
      description="Optional. Your data stays local-first either way; this only mirrors to Supabase."
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
          {step === 'config' ? (
            <Button
              variant="primary"
              type="submit"
              form="sync-config-form"
              disabled={configure.isPending}
            >
              {configure.isPending ? 'Saving…' : 'Save project'}
            </Button>
          ) : (
            <Button
              variant="primary"
              type="submit"
              form="sync-auth-form"
              disabled={signIn.isPending || signUp.isPending}
            >
              {signIn.isPending ? 'Signing in…' : signUp.isPending ? 'Signing up…' : 'Continue'}
            </Button>
          )}
        </>
      }
    >
      {step === 'config' ? (
        <form id="sync-config-form" onSubmit={handleConfigure} noValidate>
          <div className={fields.field}>
            <label className={fields.label} htmlFor="sync-url">
              Supabase project URL
            </label>
            <input
              id="sync-url"
              className={fields.input}
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              autoComplete="off"
              required
            />
            <span className={fields.hint}>
              Supabase dashboard → Project Settings → API. Keys are stored only on this machine.
            </span>
          </div>
          <div className={fields.field}>
            <label className={fields.label} htmlFor="sync-anon-key">
              Supabase anon key
            </label>
            <input
              id="sync-anon-key"
              className={fields.input}
              type="text"
              value={anonKey}
              onChange={(event) => setAnonKey(event.target.value)}
              placeholder="eyJhbGciOi..."
              autoComplete="off"
              required
            />
          </div>
          {error ? (
            <p className={fields.error} role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <form id="sync-auth-form" onSubmit={handleAuthSubmit} noValidate>
          <div className={fields.field}>
            <label className={fields.label} htmlFor="sync-email">
              Email
            </label>
            <input
              id="sync-email"
              className={fields.input}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className={fields.field}>
            <label className={fields.label} htmlFor="sync-password">
              Password
            </label>
            <input
              id="sync-password"
              className={fields.input}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={step === 'auth' ? 'current-password' : 'new-password'}
              required
            />
          </div>
          {error ? (
            <p className={fields.error} role="alert">
              {error}
            </p>
          ) : null}
          {notice ? <p className={fields.hint}>{notice}</p> : null}
        </form>
      )}
    </Dialog>
  );
}
