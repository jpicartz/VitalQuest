import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toISODateString,
  parseISODate,
  addDaysISO,
  timestampForISODate,
  timestampToISODate,
  isSameISODate,
  formatNavigatorLabel,
} from './dateUtils';

describe('toISODateString', () => {
  it('formats a date as YYYY-MM-DD with zero padding', () => {
    expect(toISODateString(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toISODateString(new Date(2026, 11, 25))).toBe('2026-12-25');
  });

  it('uses the LOCAL calendar day, not UTC', () => {
    // This is the whole reason the helper exists: toISOString() on a late-evening
    // local time rolls forward a day in negative-offset zones.
    const lateLocal = new Date(2026, 6, 31, 23, 30);
    expect(toISODateString(lateLocal)).toBe('2026-07-31');
  });
});

describe('parseISODate', () => {
  it('parses to local midnight', () => {
    const d = parseISODate('2026-07-31');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // zero-indexed
    expect(d.getDate()).toBe(31);
    expect(d.getHours()).toBe(0);
  });

  it('round-trips with toISODateString', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2028-02-29', '2026-12-31']) {
      expect(toISODateString(parseISODate(iso))).toBe(iso);
    }
  });
});

describe('addDaysISO', () => {
  it('adds and subtracts days', () => {
    expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysISO('2026-07-31', -1)).toBe('2026-07-30');
    expect(addDaysISO('2026-07-15', 0)).toBe('2026-07-15');
  });

  it('rolls over month boundaries', () => {
    expect(addDaysISO('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('rolls over year boundaries', () => {
    expect(addDaysISO('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles leap years', () => {
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysISO('2028-02-29', 1)).toBe('2028-03-01');
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01'); // not a leap year
  });

  it('survives a spring-forward DST transition', () => {
    // Local getters + setDate keep this correct even on a 23-hour day.
    expect(addDaysISO('2026-03-07', 1)).toBe('2026-03-08');
  });

  it('handles multi-week jumps', () => {
    expect(addDaysISO('2026-07-31', 30)).toBe('2026-08-30');
    expect(addDaysISO('2026-07-31', -30)).toBe('2026-07-01');
  });
});

describe('timestamp helpers', () => {
  it('round-trips a date through a timestamp', () => {
    expect(timestampToISODate(timestampForISODate('2026-07-31'))).toBe('2026-07-31');
  });

  it('isSameISODate matches a timestamp to its calendar day', () => {
    const ts = timestampForISODate('2026-07-31');
    expect(isSameISODate(ts, '2026-07-31')).toBe(true);
    expect(isSameISODate(ts, '2026-07-30')).toBe(false);
  });

  it('treats any time within the day as the same day', () => {
    const lateInDay = new Date(2026, 6, 31, 23, 59, 59).getTime();
    expect(isSameISODate(lateInDay, '2026-07-31')).toBe(true);
  });
});

describe('formatNavigatorLabel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 31, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('labels the current day "Today"', () => {
    expect(formatNavigatorLabel('2026-07-31').title).toBe('Today');
  });

  it('labels the previous day "Yesterday"', () => {
    expect(formatNavigatorLabel('2026-07-30').title).toBe('Yesterday');
  });

  it('uses a weekday format for older dates', () => {
    const { title } = formatNavigatorLabel('2026-07-25');
    expect(title).not.toBe('Today');
    expect(title).not.toBe('Yesterday');
    expect(title).toMatch(/Sat/);
  });

  it('always provides a full readable subtitle', () => {
    expect(formatNavigatorLabel('2026-07-31').subtitle).toBe('July 31, 2026');
  });
});
