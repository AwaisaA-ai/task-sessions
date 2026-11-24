/**
 * Domain + IPC contract shared by the Electron main process and the React
 * renderer. Single source of truth for shapes crossing the process boundary.
 */

export type SessionStatus = 'active' | 'completed' | 'archived';

export const SESSION_STATUSES: readonly SessionStatus[] = ['active', 'completed', 'archived'];

/** Which slice of sessions a list query returns. */
export type SessionView = 'all' | 'active' | 'completed' | 'archived';

export const TITLE_MAX_LENGTH = 200;
export const DESCRIPTION_MAX_LENGTH = 1000;

export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  deletedAt: string | null;
  ownerId: string | null;
}

/** Session row plus live task counts, so the list can reuse computeProgress. */
export interface SessionSummary extends Session {
  total: number;
  done: number;
}

export interface Task {
  id: string;
  sessionId: string;
  description: string;
  isDone: boolean;
  dueDate: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ListSessionsInput {
  view?: SessionView;
  query?: string;
}

export interface CreateSessionInput {
  title: string;
}

export interface CreateTaskInput {
  sessionId: string;
  description: string;
  dueDate?: string | null;
}

export interface UpdateTaskInput {
  id: string;
  description?: string;
  dueDate?: string | null;
}

export type ExportFormat = 'csv' | 'json';

/** Everything the renderer needs to render the sync/account area. */
export interface AuthUser {
  id: string;
  email: string | null;
}

export type SyncState = 'local-only' | 'signed-out' | 'syncing' | 'idle' | 'error';

export interface SyncStatus {
  configured: boolean;
  user: AuthUser | null;
  state: SyncState;
  lastSyncedAt: string | null;
  message: string | null;
}

export interface SyncConfigInput {
  url: string;
  anonKey: string;
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface SignUpResult {
  requiresEmailConfirmation: boolean;
}

export interface SyncRunResult {
  pushed: number;
  pulled: number;
  conflicts: number;
}

/** The surface exposed on `window.taskSessions` by the preload script. */
export interface TaskSessionsApi {
  listSessions(input?: ListSessionsInput): Promise<SessionSummary[]>;
  getSession(id: string): Promise<Session>;
  createSession(input: CreateSessionInput): Promise<Session>;
  renameSession(id: string, title: string): Promise<Session>;
  setSessionStatus(id: string, status: SessionStatus): Promise<Session>;
  softDeleteSession(id: string): Promise<void>;
  restoreSession(id: string): Promise<Session>;
  listTasks(sessionId: string): Promise<Task[]>;
  createTask(input: CreateTaskInput): Promise<Task>;
  updateTask(input: UpdateTaskInput): Promise<Task>;
  toggleTask(id: string): Promise<Task>;
  softDeleteTask(id: string): Promise<void>;
  exportSession(id: string, format: ExportFormat): Promise<{ path: string } | null>;

  syncStatus(): Promise<SyncStatus>;
  syncConfigure(input: SyncConfigInput): Promise<SyncStatus>;
  syncSignIn(input: AuthCredentials): Promise<SyncStatus>;
  syncSignUp(input: AuthCredentials): Promise<SignUpResult>;
  syncSignOut(): Promise<SyncStatus>;
  syncRun(): Promise<SyncRunResult>;
  /** Debounced background sync; the answer arrives as a sync:status event. */
  syncSchedule(): Promise<void>;
  onSyncStatus(listener: (status: SyncStatus) => void): () => void;
}
