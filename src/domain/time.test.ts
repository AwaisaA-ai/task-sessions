import { describe, expect, it } from 'vitest';
import { formatDateKey, formatDueLabel, formatRelativeTime, parseDateKey, toDateKey } from './time';

const NOW = new Date(2026, 10, 23, 12, 0, 0); // Mon 23 Nov 2026, local time

describe('date keys', () => {
  it('formats a local date key without UTC drift', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });

  it('parses a date key as a local date', () => {
    const parsed = parseDateKey('2026-11-23');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(10);
    expect(parsed.getDate()).toBe(23);
  });

  it('omits the year for the current year', () => {
    expect(formatDateKey('2026-11-23', NOW)).toBe('23 Nov');
    expect(formatDateKey('2025-11-23', NOW)).toBe('23 Nov 2025');
  });
});

describe('formatRelativeTime', () => {
  const iso = (date: Date) => date.toISOString();

  it('says "just now" for the last minute', () => {
    expect(formatRelativeTime(iso(new Date(NOW.getTime() - 30_000)), NOW)).toBe('just now');
  });

  it('counts minutes and hours', () => {
    expect(formatRelativeTime(iso(new Date(NOW.getTime() - 5 * 60_000)), NOW)).toBe('5 min ago');
    expect(formatRelativeTime(iso(new Date(NOW.getTime() - 3 * 3_600_000)), NOW)).toBe('3 h ago');
  });

  it('names yesterday', () => {
    expect(formatRelativeTime(iso(new Date(2026, 10, 22, 9, 0, 0)), NOW)).toBe('Yesterday');
  });

  it('counts days inside the last week', () => {
    expect(formatRelativeTime(iso(new Date(2026, 10, 20, 9, 0, 0)), NOW)).toBe('3 days ago');
  });

  it('falls back to a date for older timestamps', () => {
    expect(formatRelativeTime(iso(new Date(2026, 9, 2, 9, 0, 0)), NOW)).toBe('2 Oct');
  });

  it('returns an empty string for garbage input', () => {
    expect(formatRelativeTime('not-a-date', NOW)).toBe('');
  });
});

describe('formatDueLabel', () => {
  it('marks past dates as overdue', () => {
    expect(formatDueLabel('2026-11-22', NOW)).toEqual({
      text: 'Overdue · 22 Nov',
      state: 'overdue',
    });
  });

  it('labels today and tomorrow', () => {
    expect(formatDueLabel('2026-11-23', NOW)).toEqual({ text: 'Due today', state: 'today' });
    expect(formatDueLabel('2026-11-24', NOW)).toEqual({
      text: 'Due tomorrow',
      state: 'upcoming',
    });
  });

  it('shows the date for later deadlines', () => {
    expect(formatDueLabel('2026-12-01', NOW)).toEqual({
      text: 'Due 1 Dec',
      state: 'upcoming',
    });
  });
});
