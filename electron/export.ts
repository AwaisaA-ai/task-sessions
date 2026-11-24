import type { ExportFormat, Session, Task } from '../shared/types';

/** Filenames stay readable and safe on every OS. */
export function slugifyTitle(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase()
      .slice(0, 60) || 'session'
  );
}

export function dateStamp(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function exportFileName(
  title: string,
  format: ExportFormat,
  now: Date = new Date(),
): string {
  return `${slugifyTitle(title)}_${dateStamp(now)}.${format === 'json' ? 'json' : 'csv'}`;
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** One header row plus one row per live task. */
export function buildSessionCsv(tasks: Task[]): string {
  const header = ['description', 'is_done', 'due_date', 'created_at', 'updated_at'];
  const lines = [header.join(',')];

  for (const task of tasks) {
    lines.push(
      [
        csvCell(task.description),
        task.isDone ? 'true' : 'false',
        task.dueDate ?? '',
        task.createdAt,
        task.updatedAt,
      ].join(','),
    );
  }

  return `${lines.join('\r\n')}\r\n`;
}

export function buildSessionJson(session: Session, tasks: Task[], now: Date = new Date()): string {
  return JSON.stringify({ session, tasks, exportedAt: now.toISOString() }, null, 2);
}
