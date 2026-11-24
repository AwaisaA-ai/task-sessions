import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SESSION_STATUSES, type SessionStatus } from '../../shared/types';
import type { LocalSessionRow, LocalTaskRow } from '../db/syncRepo';

/**
 * The remote side of sync, behind an interface so the engine can be tested
 * against an in-memory fake (see `engine.test.ts`) with no network at all.
 *
 * Rows use the exact column names of the Supabase tables documented in
 * `SUPABASE_SETUP.md`.
 */
export interface RemoteStore {
  pullSessions(ownerId: string): Promise<LocalSessionRow[]>;
  pullTasks(ownerId: string): Promise<LocalTaskRow[]>;
  pushSessions(rows: LocalSessionRow[]): Promise<void>;
  pushTasks(rows: LocalTaskRow[]): Promise<void>;
}

export type Remote = RemoteStore & { client: SupabaseClient };

/** Canonical ISO-8601 UTC with milliseconds, the format the local DB stores. */
function toIso(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Supabase returned a non-text ${field}.`);
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`Supabase returned an unreadable ${field}: ${value}`);
  }
  return new Date(ms).toISOString();
}

function toNullableIso(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value, field);
}

function toText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Supabase returned a non-text ${field}.`);
  }
  return value;
}

function toStatus(value: unknown): SessionStatus {
  if (typeof value !== 'string' || !SESSION_STATUSES.includes(value as SessionStatus)) {
    throw new Error(`Supabase returned an unknown session status: ${String(value)}`);
  }
  return value as SessionStatus;
}

function normalizeSession(raw: Record<string, unknown>): LocalSessionRow {
  return {
    id: toText(raw.id, 'sessions.id'),
    title: toText(raw.title, 'sessions.title'),
    created_at: toIso(raw.created_at, 'sessions.created_at'),
    updated_at: toIso(raw.updated_at, 'sessions.updated_at'),
    status: toStatus(raw.status),
    deleted_at: toNullableIso(raw.deleted_at, 'sessions.deleted_at'),
    owner_id: toText(raw.owner_id, 'sessions.owner_id'),
    dirty: 0,
    synced_at: null,
  };
}

function normalizeTask(raw: Record<string, unknown>): LocalTaskRow {
  if (typeof raw.is_done !== 'boolean' && typeof raw.is_done !== 'number') {
    throw new Error('Supabase returned a non-boolean tasks.is_done.');
  }

  return {
    id: toText(raw.id, 'tasks.id'),
    session_id: toText(raw.session_id, 'tasks.session_id'),
    description: toText(raw.description, 'tasks.description'),
    is_done: raw.is_done ? 1 : 0,
    due_date: raw.due_date === null || raw.due_date === undefined ? null : String(raw.due_date),
    sort_order: typeof raw.sort_order === 'number' ? raw.sort_order : 0,
    created_at: toIso(raw.created_at, 'tasks.created_at'),
    updated_at: toIso(raw.updated_at, 'tasks.updated_at'),
    deleted_at: toNullableIso(raw.deleted_at, 'tasks.deleted_at'),
    owner_id: toText(raw.owner_id, 'tasks.owner_id'),
    dirty: 0,
    synced_at: null,
  };
}

function describeError(context: string, error: { message?: string } | null): Error {
  return new Error(`${context}: ${error?.message ?? 'unknown Supabase error'}`);
}

/**
 * A thin Supabase client that carries the signed-in user's access token.
 * The token is passed in rather than read from storage so the sync manager
 * stays in charge of refresh and sign-out.
 */
export function createSupabaseRemote(url: string, anonKey: string, accessToken: string): Remote {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });

  const store: RemoteStore = {
    async pullSessions(ownerId) {
      const { data, error } = await client.from('sessions').select('*').eq('owner_id', ownerId);
      if (error) throw describeError('Could not download sessions', error);
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeSession);
    },

    async pullTasks(ownerId) {
      const { data, error } = await client.from('tasks').select('*').eq('owner_id', ownerId);
      if (error) throw describeError('Could not download tasks', error);
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeTask);
    },

    async pushSessions(rows) {
      if (rows.length === 0) return;

      const payload = rows.map((row) => ({
        id: row.id,
        title: row.title,
        created_at: row.created_at,
        updated_at: row.updated_at,
        status: row.status,
        deleted_at: row.deleted_at,
        owner_id: row.owner_id,
      }));

      const { error } = await client.from('sessions').upsert(payload, { onConflict: 'id' });
      if (error) throw describeError('Could not upload sessions', error);
    },

    async pushTasks(rows) {
      if (rows.length === 0) return;

      const payload = rows.map((row) => ({
        id: row.id,
        session_id: row.session_id,
        description: row.description,
        is_done: row.is_done === 1,
        due_date: row.due_date,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
        owner_id: row.owner_id,
      }));

      const { error } = await client.from('tasks').upsert(payload, { onConflict: 'id' });
      if (error) throw describeError('Could not upload tasks', error);
    },
  };

  return { ...store, client };
}
