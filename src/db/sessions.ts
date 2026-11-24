import type {
  CreateSessionInput,
  ExportFormat,
  ListSessionsInput,
  SessionStatus,
} from '../../shared/types';
import { getApi } from './client';

export const sessionsRepo = {
  list: (input?: ListSessionsInput) => getApi().listSessions(input),
  get: (id: string) => getApi().getSession(id),
  create: (input: CreateSessionInput) => getApi().createSession(input),
  rename: (id: string, title: string) => getApi().renameSession(id, title),
  setStatus: (id: string, status: SessionStatus) => getApi().setSessionStatus(id, status),
  remove: (id: string) => getApi().softDeleteSession(id),
  restore: (id: string) => getApi().restoreSession(id),
  export: (id: string, format: ExportFormat) => getApi().exportSession(id, format),
};
