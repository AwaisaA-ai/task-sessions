import { describe, expect, it } from 'vitest';
import { computeProgress } from './progress';

function task(isDone: boolean, deletedAt: string | null = null) {
  return { isDone, deletedAt };
}

describe('computeProgress', () => {
  it('reports the empty state when there are no live tasks', () => {
    expect(computeProgress([])).toEqual({
      total: 0,
      done: 0,
      percent: 0,
      label: 'No tasks yet',
    });
  });

  it('reports 33% for 1 of 3 done', () => {
    expect(computeProgress([task(true), task(false), task(false)])).toEqual({
      total: 3,
      done: 1,
      percent: 33,
      label: '1 of 3 tasks done',
    });
  });

  it('reports 100% and an "all done" label when everything is done', () => {
    expect(computeProgress([task(true), task(true), task(true)])).toEqual({
      total: 3,
      done: 3,
      percent: 100,
      label: 'All 3 tasks done',
    });
  });

  it('treats soft-deleted tasks as if they never existed', () => {
    const tasks = [task(true, '2026-01-01T00:00:00.000Z'), task(false, '2026-01-02T00:00:00.000Z')];

    expect(computeProgress(tasks)).toEqual({
      total: 0,
      done: 0,
      percent: 0,
      label: 'No tasks yet',
    });
  });

  it('ignores soft-deleted tasks inside a mixed list', () => {
    const tasks = [task(true), task(false), task(true, '2026-01-01T00:00:00.000Z')];

    expect(computeProgress(tasks)).toEqual({
      total: 2,
      done: 1,
      percent: 50,
      label: '1 of 2 tasks done',
    });
  });

  it('rounds the percentage with Math.round', () => {
    expect(computeProgress([task(true), task(false), task(false)]).percent).toBe(33);
    expect(computeProgress([task(true), task(true), task(false)]).percent).toBe(67);
    expect(
      computeProgress([task(true), task(false), task(false), task(false), task(false), task(false)])
        .percent,
    ).toBe(17);
    expect(
      computeProgress([task(true), task(true), task(true), task(true), task(true), task(false)])
        .percent,
    ).toBe(83);
  });

  it('never reports done greater than total', () => {
    const progress = computeProgress([task(true), task(true)]);
    expect(progress.done).toBeLessThanOrEqual(progress.total);
    expect(progress.percent).toBe(100);
  });
});
