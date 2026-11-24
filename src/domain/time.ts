import { classifyDue } from './filters';

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/** Parses a stored YYYY-MM-DD string as a local date (no UTC shift). */
export function parseDateKey(value: string): Date {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return new Date(year, month - 1, day);
}

export function formatDateKey(value: string, now: Date = new Date()): string {
  const date = parseDateKey(value);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  });
}

/** Short "when was this touched" label for session rows. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 60_000) return 'just now';

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (toDateKey(then) === toDateKey(now)) return `${hours} h ago`;

  if (toDateKey(then) === toDateKey(addDays(now, -1))) return 'Yesterday';

  const days = Math.floor((now.getTime() - parseDateKey(toDateKey(then)).getTime()) / 86_400_000);
  if (days < 7) return `${days} days ago`;

  return formatDateKey(toDateKey(then), now);
}

export interface DueLabel {
  text: string;
  state: 'overdue' | 'today' | 'upcoming';
}

export function formatDueLabel(dueDate: string, now: Date = new Date()): DueLabel {
  const state = classifyDue(dueDate, now);

  if (state === 'overdue') {
    return { text: `Overdue · ${formatDateKey(dueDate, now)}`, state: 'overdue' };
  }
  if (state === 'today') {
    return { text: 'Due today', state: 'today' };
  }
  if (dueDate === toDateKey(addDays(now, 1))) {
    return { text: 'Due tomorrow', state: 'upcoming' };
  }
  return { text: `Due ${formatDateKey(dueDate, now)}`, state: 'upcoming' };
}
