import type { TaskSessionsApi } from '../../shared/types';

/**
 * The only place the renderer reaches out of the page. Everything else goes
 * through `db/sessions.ts` and `db/tasks.ts` (PLAN.md section 8).
 */
export function getApi(): TaskSessionsApi {
  const api = window.taskSessions;

  if (!api) {
    throw new Error(
      'The desktop bridge is unavailable. Start the app with `npm run dev`, not in a plain browser.',
    );
  }

  return api;
}
