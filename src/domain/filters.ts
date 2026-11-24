import type { Task } from '../../shared/types';

export type DueWindow = 'any' | 'overdue' | 'today' | 'week';

export const DUE_WINDOWS: { value: DueWindow; label: string }[] = [
  { value: 'any', label: 'Any date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Due today' },
  { value: 'week', label: 'Next 7 days' },
];

export function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Case-insensitive "contains" across any number of fields. */
export function matchesQuery(values: (string | null | undefined)[], query: string): boolean {
  const needle = normalize(query);
  if (needle.length === 0) return true;
  return values.some((value) => typeof value === 'string' && normalize(value).includes(needle));
}

export type DueState = 'overdue' | 'today' | 'soon' | 'later';

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Pure date classification used by labels, filters and sorting. */
export function classifyDue(dueDate: string | null, now: Date = new Date()): DueState | null {
  if (!dueDate) return null;

  const today = localDateKey(now);
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  if (dueDate <= localDateKey(shiftDays(now, 7))) return 'soon';
  return 'later';
}

export function matchesDueWindow(
  dueDate: string | null,
  window: DueWindow,
  now: Date = new Date(),
): boolean {
  if (window === 'any') return true;

  const state = classifyDue(dueDate, now);
  if (state === null) return false;
  if (window === 'overdue') return state === 'overdue';
  if (window === 'today') return state === 'today';
  return state === 'today' || state === 'soon';
}

export interface TaskFilter {
  query?: string;
  dueWindow?: DueWindow;
}

/** Combines a text query with a due-date window. Deleted tasks never show. */
export function filterTasks(
  tasks: Task[],
  filter: TaskFilter = {},
  now: Date = new Date(),
): Task[] {
  const { query = '', dueWindow = 'any' } = filter;

  return tasks.filter(
    (task) =>
      task.deletedAt === null &&
      matchesQuery([task.description], query) &&
      matchesDueWindow(task.dueDate, dueWindow, now),
  );
}
