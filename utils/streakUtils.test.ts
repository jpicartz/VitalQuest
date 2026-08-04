import { describe, it, expect } from 'vitest';
import { updateStreak, resetQuestsIfNewDay } from './streakUtils';
import { GamificationState } from '../types';

const state = (over: Partial<GamificationState> = {}): GamificationState => ({
  xp: 0,
  level: 1,
  streak: 0,
  completedQuestIds: [],
  badges: [],
  ...over,
});

describe('updateStreak', () => {
  it('starts a streak at 1 on the first ever log', () => {
    const result = updateStreak(state({ streak: 0 }), '2026-07-31');
    expect(result.streak).toBe(1);
    expect(result.lastLogDate).toBe('2026-07-31');
  });

  it('returns the same object reference when already logged today', () => {
    // Identity matters: the caller relies on this to skip a redundant setState.
    const input = state({ streak: 5, lastLogDate: '2026-07-31' });
    expect(updateStreak(input, '2026-07-31')).toBe(input);
  });

  it('increments when the last log was yesterday', () => {
    const result = updateStreak(state({ streak: 5, lastLogDate: '2026-07-30' }), '2026-07-31');
    expect(result.streak).toBe(6);
    expect(result.lastLogDate).toBe('2026-07-31');
  });

  it('resets to 1 after a two-day gap', () => {
    const result = updateStreak(state({ streak: 12, lastLogDate: '2026-07-29' }), '2026-07-31');
    expect(result.streak).toBe(1);
  });

  it('resets to 1 after a long absence', () => {
    const result = updateStreak(state({ streak: 30, lastLogDate: '2026-05-01' }), '2026-07-31');
    expect(result.streak).toBe(1);
  });

  it('increments across a month boundary', () => {
    expect(updateStreak(state({ streak: 3, lastLogDate: '2026-07-31' }), '2026-08-01').streak).toBe(4);
  });

  it('increments across a year boundary', () => {
    expect(updateStreak(state({ streak: 9, lastLogDate: '2025-12-31' }), '2026-01-01').streak).toBe(10);
  });

  it('increments across a leap day', () => {
    expect(updateStreak(state({ streak: 2, lastLogDate: '2028-02-28' }), '2028-02-29').streak).toBe(3);
    expect(updateStreak(state({ streak: 3, lastLogDate: '2028-02-29' }), '2028-03-01').streak).toBe(4);
  });

  it('increments across a spring-forward DST boundary', () => {
    // That day is only 23h in many zones; Math.round in the diff is what keeps
    // this from being read as a 0-day gap.
    expect(updateStreak(state({ streak: 4, lastLogDate: '2026-03-07' }), '2026-03-08').streak).toBe(5);
  });

  it('increments across an autumn fall-back DST boundary', () => {
    // 25h day — must not round to 2 and reset the streak.
    expect(updateStreak(state({ streak: 4, lastLogDate: '2026-11-01' }), '2026-11-02').streak).toBe(5);
  });

  it('resets rather than throwing on a malformed lastLogDate', () => {
    const result = updateStreak(state({ streak: 8, lastLogDate: 'not-a-date' }), '2026-07-31');
    expect(result.streak).toBe(1);
  });

  it('resets when lastLogDate is in the future (clock skew)', () => {
    expect(updateStreak(state({ streak: 8, lastLogDate: '2026-08-05' }), '2026-07-31').streak).toBe(1);
  });

  it('leaves xp, level and badges untouched', () => {
    const result = updateStreak(
      state({ xp: 250, level: 3, badges: ['century'], streak: 1, lastLogDate: '2026-07-30' }),
      '2026-07-31'
    );
    expect(result.xp).toBe(250);
    expect(result.level).toBe(3);
    expect(result.badges).toEqual(['century']);
  });
});

describe('resetQuestsIfNewDay', () => {
  it('returns the same object reference when the day has not changed', () => {
    const input = state({ completedQuestIds: ['q1'], lastQuestDate: '2026-07-31' });
    expect(resetQuestsIfNewDay(input, '2026-07-31')).toBe(input);
  });

  it('clears completed quests on a new day', () => {
    const result = resetQuestsIfNewDay(
      state({ completedQuestIds: ['q1', 'q2'], lastQuestDate: '2026-07-30' }),
      '2026-07-31'
    );
    expect(result.completedQuestIds).toEqual([]);
    expect(result.lastQuestDate).toBe('2026-07-31');
  });

  it('resets on first run when lastQuestDate is undefined', () => {
    const result = resetQuestsIfNewDay(state({ completedQuestIds: ['q1'] }), '2026-07-31');
    expect(result.completedQuestIds).toEqual([]);
  });

  it('does not touch streak, xp or badges', () => {
    const result = resetQuestsIfNewDay(
      state({ xp: 400, streak: 9, badges: ['week-warrior'], completedQuestIds: ['q1'], lastQuestDate: '2026-07-30' }),
      '2026-07-31'
    );
    expect(result.xp).toBe(400);
    expect(result.streak).toBe(9);
    expect(result.badges).toEqual(['week-warrior']);
  });
});
