import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, app, dialog, ipcMain } from 'electron';
import type { DatabaseSync } from 'node:sqlite';
import {
  DESCRIPTION_MAX_LENGTH,
  SESSION_STATUSES,
  TITLE_MAX_LENGTH,
  type AuthCredentials,
  type CreateSessionInput,
  type CreateTaskInput,
  type ExportFormat,
  type ListSessionsInput,
  type SessionStatus,
  type SignUpResult,
  type SyncConfigInput,
  type SyncRunResult,
  type SyncStatus,
  type UpdateTaskInput,
} from '../shared/types';
import {
  createSession,
  getSession,
  listSessions,
  renameSession,
  restoreSession,
  setSessionStatus,
  softDeleteSession,
} from './db/sessions';
import { createTask, getTask, listTasks, softDeleteTask, toggleTask, updateTask } from './db/tasks';
import { buildSessionCsv, buildSessionJson, exportFileName } from './export';
import type { SyncManager } from './sync/manager';

const ID_MAX_LENGTH = 64;
const QUERY_MAX_LENGTH = 200;

function requireId(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > ID_MAX_LENGTH) {
    throw new Error('Invalid id.');
  }
  return value;
}

function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be text.`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`${label} cannot be empty.`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${label} cannot be longer than ${maxLength} characters.`);
  }
  return trimmed;
}

function optionalDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Due date must use the YYYY-MM-DD format.');
  }
  return value;
}

function requireStatus(value: unknown): SessionStatus {
  if (typeof value !== 'string' || !SESSION_STATUSES.includes(value as SessionStatus)) {
    throw new Error('Unknown session status.');
  }
  return value as SessionStatus;
}

async function exportSession(
  db: DatabaseSync,
  id: string,
  format: ExportFormat,
): Promise<{ path: string } | null> {
  const session = getSession(db, id);
  const tasks = listTasks(db, id);

  const parent = BrowserWindow.getFocusedWindow();
  const options = {
    title: `Export ${session.title}`,
    defaultPath: path.join(app.getPath('documents'), exportFileName(session.title, format)),
    filters:
      format === 'json'
        ? [{ name: 'JSON', extensions: ['json'] }]
        : [{ name: 'CSV', extensions: ['csv'] }],
  };

  const result = parent
    ? await dialog.showSaveDialog(parent, options)
    : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) return null;

  const contents = format === 'json' ? buildSessionJson(session, tasks) : buildSessionCsv(tasks);
  fs.writeFileSync(result.filePath, contents, 'utf8');

  return { path: result.filePath };
}

/** The renderer -> main calls land here. Inputs are validated at the boundary so
 * the SQL CHECK constraints never have to reject user input.
 */
export function registerIpc(db: DatabaseSync, syncManager: SyncManager): void {
  ipcMain.handle('sessions:list', (_event, input: ListSessionsInput | undefined) => {
    const view = input?.view ?? 'all';
    const query = typeof input?.query === 'string' ? input.query.slice(0, QUERY_MAX_LENGTH) : '';
    return listSessions(db, { view, query });
  });

  ipcMain.handle('sessions:get', (_event, id: unknown) => getSession(db, requireId(id)));

  ipcMain.handle('sessions:create', (_event, input: CreateSessionInput) =>
    createSession(db, requireText(input?.title, 'Session title', TITLE_MAX_LENGTH)),
  );

  ipcMain.handle('sessions:rename', (_event, id: unknown, title: unknown) =>
    renameSession(db, requireId(id), requireText(title, 'Session title', TITLE_MAX_LENGTH)),
  );

  ipcMain.handle('sessions:setStatus', (_event, id: unknown, status: unknown) =>
    setSessionStatus(db, requireId(id), requireStatus(status)),
  );

  ipcMain.handle('sessions:delete', (_event, id: unknown) => {
    softDeleteSession(db, requireId(id));
  });

  ipcMain.handle('sessions:restore', (_event, id: unknown) => restoreSession(db, requireId(id)));

  ipcMain.handle('sessions:export', (_event, id: unknown, format: unknown) => {
    if (format !== 'csv' && format !== 'json') {
      throw new Error('Unsupported export format.');
    }
    return exportSession(db, requireId(id), format);
  });

  ipcMain.handle('tasks:list', (_event, sessionId: unknown) => listTasks(db, requireId(sessionId)));

  ipcMain.handle('tasks:create', (_event, input: CreateTaskInput) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid task payload.');
    return createTask(db, {
      sessionId: requireId(input.sessionId),
      description: requireText(input.description, 'Task description', DESCRIPTION_MAX_LENGTH),
      dueDate: optionalDate(input.dueDate),
    });
  });

  ipcMain.handle('tasks:update', (_event, input: UpdateTaskInput) => {
    if (!input || typeof input !== 'object') throw new Error('Invalid task payload.');
    const id = requireId(input.id);
    getTask(db, id);

    return updateTask(db, {
      id,
      description:
        input.description === undefined
          ? undefined
          : requireText(input.description, 'Task description', DESCRIPTION_MAX_LENGTH),
      dueDate: input.dueDate === undefined ? undefined : optionalDate(input.dueDate),
    });
  });

  ipcMain.handle('tasks:toggle', (_event, id: unknown) => toggleTask(db, requireId(id)));

  ipcMain.handle('tasks:delete', (_event, id: unknown) => {
    softDeleteTask(db, requireId(id));
  });

  // ---------------------------------------------------------------- sync ----

  ipcMain.handle('sync:status', async () => syncManager.getStatus());

  ipcMain.handle('sync:configure', async (_event, input: SyncConfigInput) => {
    const url = requireSyncUrl(input?.url);
    const anonKey = requireAnonKey(input?.anonKey);
    const status = await syncManager.syncConfigure({ url, anonKey });
    return status;
  });

  ipcMain.handle('sync:signIn', async (_event, input: AuthCredentials) => {
    const email = requireEmail(input?.email);
    const password = requirePassword(input?.password);
    const status = await syncManager.syncSignIn({ email, password });
    return status;
  });

  ipcMain.handle('sync:signUp', async (_event, input: AuthCredentials): Promise<SignUpResult> => {
    const email = requireEmail(input?.email);
    const password = requirePassword(input?.password);
    const result = await syncManager.syncSignUp({ email, password });
    return result;
  });

  ipcMain.handle('sync:signOut', async () => syncManager.syncSignOut());

  ipcMain.handle('sync:run', async (): Promise<SyncRunResult> => syncManager.syncRun());

  ipcMain.handle('sync:schedule', async () => {
    await syncManager.syncSchedule();
  });

  const syncListeners = new Set<{
    webContents: Electron.WebContents;
    listener: (status: SyncStatus) => void;
    unsubscribe: () => void;
  }>();

  ipcMain.on('sync:status', (event, status: SyncStatus) => {
    const sender = event.sender;
    for (const entry of syncListeners) {
      if (entry.webContents === sender) entry.listener(status);
    }
  });

  ipcMain.handle('sync:status:subscribe', async (event: Electron.IpcMainInvokeEvent, listener) => {
    const entry = { webContents: event.sender, listener, unsubscribe: () => {} };
    entry.unsubscribe = () => {
      syncListeners.delete(entry);
    };
    syncListeners.add(entry);
    return entry.unsubscribe;
  });
}

function requireSyncUrl(value: unknown): string {
  if (typeof value !== 'string' || !/^https?:\/\/.+/i.test(value.trim())) {
    throw new Error('The Supabase project URL must start with http:// or https://.');
  }
  return value.trim();
}

function requireAnonKey(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 500) {
    throw new Error('The Supabase anon key must be a short string.');
  }
  return value.trim();
}

function requireEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Email must be text.');
  const email = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return email;
}

function requirePassword(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Password must be text.');
  const password = value;
  if (password.length < 6) throw new Error('Password must be at least 6 characters.');
  return password;
}
