import { contextBridge, ipcRenderer } from 'electron';
import type {
  AuthCredentials,
  CreateSessionInput,
  CreateTaskInput,
  ExportFormat,
  ListSessionsInput,
  SessionStatus,
  SyncConfigInput,
  SyncStatus,
  TaskSessionsApi,
  UpdateTaskInput,
} from '../shared/types';

const api: TaskSessionsApi = {
  listSessions: (input?: ListSessionsInput) => ipcRenderer.invoke('sessions:list', input ?? {}),
  getSession: (id: string) => ipcRenderer.invoke('sessions:get', id),
  createSession: (input: CreateSessionInput) => ipcRenderer.invoke('sessions:create', input),
  renameSession: (id: string, title: string) => ipcRenderer.invoke('sessions:rename', id, title),
  setSessionStatus: (id: string, status: SessionStatus) =>
    ipcRenderer.invoke('sessions:setStatus', id, status),
  softDeleteSession: (id: string) => ipcRenderer.invoke('sessions:delete', id),
  restoreSession: (id: string) => ipcRenderer.invoke('sessions:restore', id),
  listTasks: (sessionId: string) => ipcRenderer.invoke('tasks:list', sessionId),
  createTask: (input: CreateTaskInput) => ipcRenderer.invoke('tasks:create', input),
  updateTask: (input: UpdateTaskInput) => ipcRenderer.invoke('tasks:update', input),
  toggleTask: (id: string) => ipcRenderer.invoke('tasks:toggle', id),
  softDeleteTask: (id: string) => ipcRenderer.invoke('tasks:delete', id),
  exportSession: (id: string, format: ExportFormat) =>
    ipcRenderer.invoke('sessions:export', id, format),

  syncStatus: () => ipcRenderer.invoke('sync:status'),
  syncConfigure: (input: SyncConfigInput) => ipcRenderer.invoke('sync:configure', input),
  syncSignIn: (input: AuthCredentials) => ipcRenderer.invoke('sync:signIn', input),
  syncSignUp: (input: AuthCredentials) => ipcRenderer.invoke('sync:signUp', input),
  syncSignOut: () => ipcRenderer.invoke('sync:signOut'),
  syncRun: () => ipcRenderer.invoke('sync:run'),
  syncSchedule: () => ipcRenderer.invoke('sync:schedule'),
  onSyncStatus: (listener: (status: SyncStatus) => void) => {
    const handle = (_event: Electron.IpcRendererEvent, status: SyncStatus) => listener(status);
    ipcRenderer.on('sync:status', handle);
    return () => {
      ipcRenderer.removeListener('sync:status', handle);
    };
  },
};

contextBridge.exposeInMainWorld('taskSessions', api);
