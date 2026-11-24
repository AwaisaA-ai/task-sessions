import type { DatabaseSync } from 'node:sqlite';
import type {
  AuthUser,
  AuthCredentials,
  SyncConfigInput,
  SyncRunResult,
  SyncStatus,
  SyncState,
} from '../../shared/types';
import { getMeta } from '../db/connection';
import { LAST_SYNCED_KEY, syncNow } from './engine';
import { createSupabaseRemote, type Remote } from './remote';
import { SyncStore } from './store';

const DEBOUNCE_MS = 1500;
const INTERVAL_MS = 60_000;

export interface SyncManagerHooks {
  broadcast: (channel: string, payload: unknown) => void;
  now?: () => string;
}

export interface SyncManagerDeps {
  storage?: SyncStore;
  hooks?: SyncManagerHooks;
}

/**
 * Owns auth + background sync for the optional Supabase mirror. The local
 * database stays the source of truth; this class only mirrors in.
 */
export class SyncManager {
  private readonly db: DatabaseSync;
  private readonly storage: SyncStore;
  private readonly hooks: SyncManagerHooks;
  private readonly now: () => string;

  private remote: Remote | null = null;
  private user: AuthUser | null = null;
  private accessToken: string | null = null;
  private config: SyncConfigInput | null = null;

  private state: SyncState = 'local-only';
  private lastSyncedAt: string | null = null;
  private message: string | null = null;

  private readonly listeners = new Set<(status: SyncStatus) => void>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: DatabaseSync, deps: SyncManagerDeps) {
    this.db = db;
    this.storage = deps.storage ?? new SyncStore('');
    this.hooks = deps.hooks ?? { broadcast: () => undefined };
    this.now = deps.hooks?.now ?? (() => new Date().toISOString());
  }

  async start(): Promise<void> {
    const [config, stored] = await Promise.all([
      this.storage.loadConfig(),
      this.storage.loadSession(),
    ]);

    this.config = config;
    this.user = null;
    this.remote = null;
    this.accessToken = stored?.accessToken ?? null;

    if (config && stored) {
      try {
        const remote = createSupabaseRemote(config.url, config.anonKey, stored.accessToken);
        const session = await remote.client.auth.setSession({
          access_token: stored.accessToken,
          refresh_token: stored.refreshToken,
        });
        const refreshed = session.error
          ? { data: { session: null }, error: session.error }
          : await remote.client.auth.refreshSession({ refresh_token: stored.refreshToken });
        const token = refreshed.data.session?.access_token ?? stored.accessToken;

        this.remote = remote;
        this.accessToken = token;
        this.user = {
          id: refreshed.data.session?.user?.id ?? '',
          email: refreshed.data.session?.user?.email ?? stored.email,
        };

        await this.runSync();
        this.state = 'idle';
        this.message = null;
      } catch {
        this.user = null;
        this.remote = null;
        this.accessToken = null;
        this.state = 'signed-out';
        this.message = 'The cloud session expired. The app keeps working fully offline.';
      }
    }

    if (this.user) {
      this.scheduleSync();
    }

    this.intervalTimer = setInterval(() => {
      void this.runSyncNow();
    }, INTERVAL_MS);
    this.intervalTimer.unref?.();
  }

  stop(): void {
    this.clearDebounce();
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  getStatus(): SyncStatus {
    return {
      configured: this.config !== null,
      user: this.user,
      state: this.state,
      lastSyncedAt: this.lastSyncedAt,
      message: this.message,
    };
  }

  async syncStatus(): Promise<SyncStatus> {
    return this.getStatus();
  }

  async syncConfigure(input: SyncConfigInput): Promise<SyncStatus> {
    this.config = input;
    await this.storage.saveConfig(input);

    if (this.user) {
      await this.runSync();
      return this.getStatus();
    }

    return {
      configured: true,
      user: null,
      state: 'local-only',
      lastSyncedAt: null,
      message: null,
    };
  }

  async syncSignIn(input: AuthCredentials): Promise<SyncStatus> {
    const config = this.config;
    if (!config) {
      throw new Error('Add the Supabase project URL and anon key before signing in.');
    }

    const remote = createSupabaseRemote(config.url, config.anonKey, this.accessToken ?? '');
    const { data, error } = await remote.client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error || !data.session) {
      throw new Error(error?.message ?? 'Could not sign in to the cloud.');
    }

    this.remote = remote;
    this.accessToken = data.session.access_token;
    this.user = { id: data.session.user.id, email: data.session.user.email ?? input.email };

    await this.runSync();
    return this.getStatus();
  }

  async syncSignUp(input: AuthCredentials): Promise<{ requiresEmailConfirmation: boolean }> {
    const config = this.config;
    if (!config) {
      throw new Error('Add the Supabase project URL and anon key before signing up.');
    }

    const remote = createSupabaseRemote(config.url, config.anonKey, '');
    const { data, error } = await remote.client.auth.signUp({
      email: input.email,
      password: input.password,
      options: { emailRedirectTo: 'task-sessions://sync-callback' },
    });

    if (error) {
      throw new Error(error.message ?? 'Could not create the account.');
    }

    if (!data.session) {
      return { requiresEmailConfirmation: true };
    }

    this.remote = remote;
    this.accessToken = data.session.access_token;
    this.user = { id: data.session.user.id, email: data.session.user.email ?? input.email };

    await this.runSync();
    return { requiresEmailConfirmation: false };
  }

  async syncSignOut(): Promise<SyncStatus> {
    this.user = null;
    this.remote = null;
    this.accessToken = null;
    this.state = 'signed-out';
    this.lastSyncedAt = null;
    this.message = null;

    await this.storage.clearSession();
    return this.getStatus();
  }

  async syncRun(): Promise<SyncRunResult> {
    if (!this.user) {
      throw new Error('Sign in before running a sync.');
    }

    const result = await this.runSync();
    return result;
  }

  async syncSchedule(): Promise<void> {
    this.clearDebounce();
    if (!this.user || !this.config) return;

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runSyncNow();
    }, DEBOUNCE_MS);
  }

  onSyncStatus(listener: (status: SyncStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private scheduleSync(): void {
    this.clearDebounce();
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.runSyncNow();
    }, DEBOUNCE_MS);
  }

  private async runSync(): Promise<SyncRunResult> {
    const ownerId = this.user?.id ?? '';
    const remote = this.remote;
    if (!ownerId || !remote) throw new Error('Sign in before running a sync.');

    this.state = 'syncing';
    this.applyStatus();

    const result = await syncNow({
      db: this.db,
      remote,
      ownerId,
      now: this.now,
    });

    this.lastSyncedAt = getMeta(this.db, LAST_SYNCED_KEY);
    this.state = 'idle';
    this.message =
      result.pushed === 0 && result.pulled === 0
        ? 'Everything is up to date.'
        : `Synced ${result.pushed} rows uploaded, ${result.pulled} downloaded, ${result.conflicts} conflicts resolved.`;

    return result;
  }

  private async runSyncNow(): Promise<void> {
    try {
      await this.runSync();
    } catch (error) {
      this.state = 'error';
      this.message = error instanceof Error ? error.message : 'The sync failed.';
      this.applyStatus();
    }
  }

  private clearDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private applyStatus(): void {
    const status: SyncStatus = {
      configured: this.config !== null,
      user: this.user,
      state: this.state,
      lastSyncedAt: this.lastSyncedAt,
      message: this.message,
    };

    for (const listener of this.listeners) {
      listener(status);
    }

    this.hooks.broadcast('sync:status', status);
  }
}
