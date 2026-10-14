import { describe, it, expect } from 'vitest';
import {
  computeVitality, computeBuild, vitalityBand, pendingAchievements,
  AVATAR_ACHIEVEMENTS, AvatarSignals,
} from './avatar';
import { aProfile } from '../test/fixtures';
import { MacroTargets, WeightEntry } from '../types';

const targets: MacroTargets = { calories: 2000, protein: 120, carbs: 200, fat: 60 };

const signals = (over: Partial<AvatarSignals> = {}): AvatarSignals => ({
  microScore: 0, proteinG: 0, caloriesKcal: 0, waterMl: 0,
  targets, waterGoalMl: 2800, daysLoggedInRange: 0, proteinDaysOnTarget: 0,
  ...over,
});

const perfectDay = signals({
  microScore: 100, proteinG: 120, caloriesKcal: 2000, waterMl: 2800,
});

describe('vitality reacts to today', () => {
  it('is depleted with nothing logged', () => {
    const v = computeVitality(signals());
    expect(v.band).toBe('depleted');
    expect(v.score).toBe(0);
  });

  it('is radiant when everything is hit', () => {
    const v = computeVitality(perfectDay);
    expect(v.band).toBe('radiant');
    expect(v.score).toBe(100);
  });

  it('weights nutrients double, so calories alone do not light it up', () => {
    // Target calories on junk: nothing else hit.
    const junk = computeVitality(signals({ caloriesKcal: 2000 }));
    // Same calories plus a full micronutrient score.
    const whole = computeVitality(signals({ caloriesKcal: 2000, microScore: 100 }));
    expect(junk.band).toBe('resting');
    expect(whole.score - junk.score).toBe(40); // 2/5 of the blend
  });

  it('names the weakest component so the nudge is specific', () => {
    const v = computeVitality(signals({ microScore: 90, proteinG: 110, caloriesKcal: 1900, waterMl: 0 }));
    expect(v.weakest?.label).toBe('Water');
  });

  it('has no weakest component on a perfect day', () => {
    expect(computeVitality(perfectDay).weakest).toBeNull();
  });

  it('coerces string values instead of producing NaN', () => {
    const v = computeVitality(signals({
      proteinG: '120g' as unknown as number,
      caloriesKcal: '2000' as unknown as number,
    }));
    expect(Number.isFinite(v.score)).toBe(true);
  });
});

describe('eating more never degrades the character', () => {
  // This is the whole reason the module exists, so it is asserted directly
  // rather than left as a property of the arithmetic.
  it('does not reduce vitality for a calorie surplus', () => {
    const onTarget = computeVitality(signals({ microScore: 80, proteinG: 120, caloriesKcal: 2000, waterMl: 2800 }));
    const over = computeVitality(signals({ microScore: 80, proteinG: 120, caloriesKcal: 3600, waterMl: 2800 }));
    expect(over.score).toBe(onTarget.score);
    expect(over.band).toBe(onTarget.band);
  });

  it('does not reward eating nothing', () => {
    const starved = computeVitality(signals({ microScore: 0, caloriesKcal: 0 }));
    const fed = computeVitality(signals({ microScore: 60, caloriesKcal: 1800 }));
    expect(fed.score).toBeGreaterThan(starved.score);
  });

  it('never lets a single day change build', () => {
    const base = { daysLoggedInRange: 20, proteinDaysOnTarget: 18 };
    const normal = computeBuild(signals({ ...base, caloriesKcal: 2000 }), aProfile());
    const huge = computeBuild(signals({ ...base, caloriesKcal: 6000 }), aProfile());
    expect(huge.tone).toBe(normal.tone);
    expect(huge.proteinConsistency).toBe(normal.proteinConsistency);
  });

  it('has no band or tone whose name describes the user as fat', () => {
    // Copy guard. 'soft' is the lowest tone and is about muscle tone, not size.
    const names = ['depleted','resting','steady','energised','radiant','soft','lean','toned','strong'];
    for (const n of names) expect(/fat|obese|chubby|heavy/i.test(n)).toBe(false);
  });
});

describe('build reacts over weeks', () => {
  const history: WeightEntry[] = [
    { date: '2026-09-01', kg: 90 },
    { date: '2026-10-01', kg: 85 },
  ];

  it('comes from protein alone when no goal is set', () => {
    const b = computeBuild(signals({ daysLoggedInRange: 10, proteinDaysOnTarget: 9 }), aProfile(), history, null);
    expect(b.proteinConsistency).toBe(90);
    expect(b.tone).toBe('strong');
    // No goal means weight contributes nothing rather than an invented target.
    expect(b.goalProgress).toBe(50);
  });

  it('tracks progress toward the user\'s own goal weight', () => {
    // 90 -> 85 of a 90 -> 80 goal is halfway.
    const b = computeBuild(signals({ daysLoggedInRange: 10, proteinDaysOnTarget: 5 }), aProfile(), history, 80);
    expect(b.goalProgress).toBe(50);
  });

  it('never exceeds 100% or drops below 0% on an overshoot', () => {
    const past = [{ date: '2026-09-01', kg: 90 }, { date: '2026-10-01', kg: 70 }] as WeightEntry[];
    expect(computeBuild(signals({ daysLoggedInRange: 5, proteinDaysOnTarget: 5 }), aProfile(), past, 80).goalProgress).toBe(100);
    const wrongWay = [{ date: '2026-09-01', kg: 90 }, { date: '2026-10-01', kg: 95 }] as WeightEntry[];
    expect(computeBuild(signals({ daysLoggedInRange: 5, proteinDaysOnTarget: 5 }), aProfile(), wrongWay, 80).goalProgress).toBe(0);
  });

  it('says so plainly when there is nothing to judge yet', () => {
    const b = computeBuild(signals(), aProfile(), [], null);
    expect(b.caption).toMatch(/Log a few days/);
    expect(b.tone).toBe('soft');
  });

  it('weight progress cannot carry tone on its own', () => {
    // Goal fully met, protein never hit: still not 'strong'.
    const met = [{ date: '2026-09-01', kg: 90 }, { date: '2026-10-01', kg: 80 }] as WeightEntry[];
    const b = computeBuild(signals({ daysLoggedInRange: 10, proteinDaysOnTarget: 0 }), aProfile(), met, 80);
    expect(b.tone).not.toBe('strong');
  });
});

describe('achievements replace the quest list as the XP source', () => {
  it('awards nothing on an empty day', () => {
    const s = signals();
    expect(pendingAchievements(s, computeVitality(s), [])).toEqual([]);
  });

  it('awards every achievement on a perfect day', () => {
    const pending = pendingAchievements(perfectDay, computeVitality(perfectDay), []);
    expect(pending).toHaveLength(AVATAR_ACHIEVEMENTS.length);
  });

  it('never re-awards one already credited today', () => {
    const v = computeVitality(perfectDay);
    const all = pendingAchievements(perfectDay, v, []).map((a) => a.id);
    expect(pendingAchievements(perfectDay, v, all)).toEqual([]);
  });

  it('keeps the XP values the quests used to give', () => {
    // The quest list handed out 15-30 XP a time; levels are 100 XP apart, so a
    // wildly different scale here would silently re-tune the whole progression.
    for (const a of AVATAR_ACHIEVEMENTS) {
      expect(a.xp).toBeGreaterThanOrEqual(10);
      expect(a.xp).toBeLessThanOrEqual(40);
    }
    const perfectTotal = AVATAR_ACHIEVEMENTS.reduce((s, a) => s + a.xp, 0);
    expect(perfectTotal).toBeGreaterThan(100);  // a flawless day is worth a level
    expect(perfectTotal).toBeLessThan(200);     // but not two
  });

  it('has unique ids, since they are persisted', () => {
    const ids = AVATAR_ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('awards protein at 90% rather than demanding exactly 100%', () => {
    const s = signals({ proteinG: 108, caloriesKcal: 2000 }); // 90%
    const ids = pendingAchievements(s, computeVitality(s), []).map((a) => a.id);
    expect(ids).toContain('avatar-protein');
  });
});

describe('vitalityBand boundaries', () => {
  it.each([
    [0, 'depleted'], [19, 'depleted'], [20, 'resting'], [44, 'resting'],
    [45, 'steady'], [69, 'steady'], [70, 'energised'], [89, 'energised'],
    [90, 'radiant'], [100, 'radiant'],
  ])('scores %i as %s', (score, band) => {
    expect(vitalityBand(score as number)).toBe(band);
  });
});
