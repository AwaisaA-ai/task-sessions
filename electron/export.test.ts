import { describe, expect, it } from 'vitest';
import type { Session, Task } from '../shared/types';
import {
  buildSessionCsv,
  buildSessionJson,
  dateStamp,
  exportFileName,
  slugifyTitle,
} from './export';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    sessionId: 'session-1',
    description: 'Task A',
    isDone: false,
    dueDate: null,
    sortOrder: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const SESSION: Session = {
  id: 'session-1',
  title: 'Weekly review',
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  status: 'active',
  deletedAt: null,
  ownerId: null,
};

describe('slugifyTitle', () => {
  it('builds a safe file name part', () => {
    expect(slugifyTitle('  Weekly Review / Q4!  ')).toBe('weekly-review-q4');
    expect(slugifyTitle('***')).toBe('session');
  });
});

describe('exportFileName', () => {
  it('uses title and date, per PLAN.md M5', () => {
    const now = new Date(2026, 10, 23);
    expect(exportFileName('Weekly review', 'csv', now)).toBe('weekly-review_2026-11-23.csv');
    expect(exportFileName('Weekly review', 'json', now)).toBe('weekly-review_2026-11-23.json');
    expect(dateStamp(now)).toBe('2026-11-23');
  });
});

describe('buildSessionCsv', () => {
  it('writes a header plus one row per task', () => {
    const csv = buildSessionCsv([makeTask(), makeTask({ id: 't2' }), makeTask({ id: 't3' })]);
    const lines = csv.trimEnd().split('\r\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('description,is_done,due_date,created_at,updated_at');
    expect(lines[1]).toContain('Task A,false');
  });

  it('escapes commas and quotes', () => {
    const csv = buildSessionCsv([
      makeTask({
        description: 'Read "chapter 5", then notes',
        isDone: true,
        dueDate: '2026-11-30',
      }),
    ]);
    const row = csv.trimEnd().split('\r\n')[1];

    expect(row).toBe(
      '"Read ""chapter 5"", then notes",true,2026-11-30,2026-11-20T10:00:00.000Z,2026-11-20T10:00:00.000Z',
    );
  });
});

describe('buildSessionJson', () => {
  it('includes the session, tasks and an export timestamp', () => {
    const parsed = JSON.parse(
      buildSessionJson(SESSION, [makeTask()], new Date('2026-11-23T12:00:00.000Z')),
    ) as Record<string, unknown>;

    expect(parsed.session).toMatchObject({ title: 'Weekly review' });
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.exportedAt).toBe('2026-11-23T12:00:00.000Z');
  });
});
