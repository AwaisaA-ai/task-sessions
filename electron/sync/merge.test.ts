import { describe, expect, it } from 'vitest';
import { decideMerge, toMillis } from './merge';

const EARLIER = '2026-11-23T10:00:00.000Z';
const LATER = '2026-11-23T10:05:00.000Z';

describe('toMillis', () => {
  it('parses ISO timestamps including Supabase offsets', () => {
    expect(toMillis('2026-11-23T10:00:00.000Z')).toBe(Date.parse('2026-11-23T10:00:00.000Z'));
    expect(toMillis('2026-11-23T15:00:00.123456+00:00')).toBe(
      Date.parse('2026-11-23T15:00:00.123Z'),
    );
  });

  it('returns NaN for missing or broken input', () => {
    expect(Number.isNaN(toMillis(null))).toBe(true);
    expect(Number.isNaN(toMillis('not-a-date'))).toBe(true);
  });
});

describe('decideMerge', () => {
  it('inserts when the row is new locally', () => {
    expect(decideMerge(null, LATER)).toBe('insert');
  });

  it('skips when both sides carry the same millisecond', () => {
    expect(decideMerge({ updatedAt: EARLIER, dirty: false }, EARLIER)).toBe('skip');
    expect(decideMerge({ updatedAt: EARLIER, dirty: true }, EARLIER)).toBe('skip');
  });

  it('takes the remote copy when the local row has no unsynced edits', () => {
    expect(decideMerge({ updatedAt: EARLIER, dirty: false }, LATER)).toBe('update');
  });

  it('keeps a newer local edit and pushes it instead', () => {
    expect(decideMerge({ updatedAt: LATER, dirty: true }, EARLIER)).toBe('skip');
  });

  it('accepts a remote row that is strictly newer than a dirty local row', () => {
    expect(decideMerge({ updatedAt: EARLIER, dirty: true }, LATER)).toBe('update');
  });

  it('prefers the remote copy when the local timestamp is unreadable', () => {
    expect(decideMerge({ updatedAt: 'garbage', dirty: true }, LATER)).toBe('update');
  });

  it('never applies an unreadable remote timestamp', () => {
    expect(decideMerge({ updatedAt: EARLIER, dirty: false }, 'garbage')).toBe('skip');
  });
});
