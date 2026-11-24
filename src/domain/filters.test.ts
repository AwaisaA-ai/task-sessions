import { describe, expect, it } from 'vitest';
import type { Task } from '../../shared/types';
import { classifyDue, filterTasks, matchesDueWindow, matchesQuery } from './filters';

const NOW = new Date(2026, 10, 23, 12, 0, 0); // Mon 23 Nov 2026, local time

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    sessionId: 'session-1',
    description: 'Write intro chapter',
    isDone: false,
    dueDate: null,
    sortOrder: 0,
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('matchesQuery', () => {
  it('matches case-insensitively', () => {
    expect(matchesQuery(['Revise Chapter 5'], 'chapter')).toBe(true);
    expect(matchesQuery(['Revise Chapter 5'], 'CHAPTER 5')).toBe(true);
  });

  it('returns true for an empty query', () => {
    expect(matchesQuery(['anything'], '   ')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesQuery(['Revise Chapter 5', undefined, null], 'past paper')).toBe(false);
  });
});

describe('classifyDue', () => {
  it('classifies a past date as overdue', () => {
    expect(classifyDue('2026-11-22', NOW)).toBe('overdue');
  });

  it('classifies today and the next 7 days as today/soon', () => {
    expect(classifyDue('2026-11-23', NOW)).toBe('today');
    expect(classifyDue('2026-11-28', NOW)).toBe('soon');
    expect(classifyDue('2026-12-10', NOW)).toBe('later');
  });

  it('returns null when there is no due date', () => {
    expect(classifyDue(null, NOW)).toBeNull();
  });
});

describe('matchesDueWindow', () => {
  it('accepts every task when the window is "any"', () => {
    expect(matchesDueWindow(null, 'any', NOW)).toBe(true);
    expect(matchesDueWindow('2020-01-01', 'any', NOW)).toBe(true);
  });

  it('filters overdue only', () => {
    expect(matchesDueWindow('2026-11-22', 'overdue', NOW)).toBe(true);
    expect(matchesDueWindow('2026-11-23', 'overdue', NOW)).toBe(false);
    expect(matchesDueWindow(null, 'overdue', NOW)).toBe(false);
  });

  it('filters today only', () => {
    expect(matchesDueWindow('2026-11-23', 'today', NOW)).toBe(true);
    expect(matchesDueWindow('2026-11-24', 'today', NOW)).toBe(false);
  });

  it('filters the next 7 days', () => {
    expect(matchesDueWindow('2026-11-23', 'week', NOW)).toBe(true);
    expect(matchesDueWindow('2026-11-30', 'week', NOW)).toBe(true);
    expect(matchesDueWindow('2026-12-01', 'week', NOW)).toBe(false);
    expect(matchesDueWindow('2026-11-22', 'week', NOW)).toBe(false);
  });
});

describe('filterTasks', () => {
  const tasks = [
    makeTask({ id: 'a', description: 'Revise Chapter 5', dueDate: '2026-11-22' }),
    makeTask({ id: 'b', description: 'Solve past paper', dueDate: '2026-11-23' }),
    makeTask({ id: 'c', description: 'Make notes', dueDate: null }),
    makeTask({
      id: 'd',
      description: 'Deleted task',
      dueDate: '2026-11-23',
      deletedAt: '2026-11-21T00:00:00.000Z',
    }),
  ];

  it('drops soft-deleted tasks', () => {
    const ids = filterTasks(tasks, {}, NOW).map((task) => task.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('combines the text query with a due window', () => {
    const ids = filterTasks(tasks, { query: 'paper', dueWindow: 'today' }, NOW).map((t) => t.id);
    expect(ids).toEqual(['b']);
  });

  it('returns nothing when the query matches only a deleted task', () => {
    expect(filterTasks(tasks, { query: 'Deleted' }, NOW)).toHaveLength(0);
  });
});
