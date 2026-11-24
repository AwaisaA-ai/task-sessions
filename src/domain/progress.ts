import type { Task } from '../../shared/types';

export interface Progress {
  total: number;
  done: number;
  percent: number;
  label: string;
}

/**
 * The label/percentage rule, shared by the task list and the session list.
 * `done` is clamped so a stale count can never break the arithmetic.
 */
export function progressFromCounts(total: number, done: number): Progress {
  if (total <= 0) {
    return { total: 0, done: 0, percent: 0, label: 'No tasks yet' };
  }

  const safeTotal = Math.max(0, Math.trunc(total));
  const safeDone = Math.min(Math.max(0, Math.trunc(done)), safeTotal);
  const percent = Math.round((safeDone / safeTotal) * 100);
  const label =
    safeDone === safeTotal
      ? `All ${safeTotal} tasks done`
      : `${safeDone} of ${safeTotal} tasks done`;

  return { total: safeTotal, done: safeDone, percent, label };
}

/**
 * Single progress rule for the whole app (PLAN.md section 4).
 * Soft-deleted tasks are not "live" and therefore never counted.
 */
export function computeProgress(tasks: Pick<Task, 'isDone' | 'deletedAt'>[]): Progress {
  const live = tasks.filter((task) => task.deletedAt === null);
  const done = live.filter((task) => task.isDone).length;

  return progressFromCounts(live.length, done);
}
