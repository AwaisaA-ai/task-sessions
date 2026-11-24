/// <reference types="vite/client" />

import type { TaskSessionsApi } from '../shared/types';

declare global {
  interface Window {
    taskSessions: TaskSessionsApi | undefined;
  }
}

export {};
