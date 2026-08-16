import { describe, it, expect } from 'vitest';
import {
  projectGoal, observedPace,
  MIN_SAFE_BMI, MIN_SAFE_CALORIES, MAX_DAILY_DEFICIT,
} from './goalProjection';
import { UserProfile, WeightEntry, Gender, ActivityLevel, Goal } from '../types';

const TODAY = '2026-08-15';

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 29, gender: Gender.Male, heightCm: 178, weightKg: 82,
  activityLevel: ActivityLevel.Moderate, goal: Goal.FatLoss,
  dietaryRestrictions: [], medicationsOrConditions: '', sleepHours: 7,
  ...over,
});

const weights = (...entries: [string, number][]): WeightEntry[] =>
  entries.map(([date, kg]) => ({ date, kg }));

// 178cm: BMI 18.5 is ~58.6kg, BMI 25 is ~79.2kg
const AT_178 = { underweight: 55, healthyLow: 62, normal: 74, over: 82 };

describe('observedPace', () => {
  it('is null with fewer than two weigh-ins', () => {
    expect(observedPace([])).toBeNull();
    expect(observedPace(weights(['2026-08-01', 82]))).toBeNull();
  });

  it('is null when the entries are less than a week apart', () => {
    // Under a week is water weight, not a trend.
    expect(observedPace(weights(['2026-08-10', 82], ['2026-08-14', 81]))).toBeNull();
  });

  it('reports kg per week for a loss', () => {
    expect(observedPace(weights(['2026-08-01', 82], ['2026-08-15', 80]))).toBe(-1);
  });

  it('reports kg per week for a gain', () => {
    expect(observedPace(weights(['2026-08-01', 80], ['2026-08-15', 81]))).toBe(0.5);
  });

  it('uses first and last regardless of array order', () => {
    expect(observedPace(weights(['2026-08-15', 80], ['2026-08-01', 82]))).toBe(-1);
  });
});

// ── The guardrails. These are the reason this module exists. ───────────────
describe('projectGoal — refusals', () => {
  it('refuses to plan loss for someone already below a healthy BMI', () => {
    const r = projectGoal(
      profile({ weightKg: AT_178.underweight }),
      { targetKg: 52, targetDate: '2026-12-01' },
      weights([TODAY, AT_178.underweight]),
      TODAY
    );
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('below-healthy-bmi');
    expect(r.message).toMatch(/doctor|dietitian/i);
    // No alternative is offered — there is no safe version of this request.
    expect(r.suggestion).toBeUndefined();
  });

  it('refuses a target that lands below a healthy BMI, and offers the floor', () => {
    const r = projectGoal(
      profile({ weightKg: AT_178.normal }),
      { targetKg: 52, targetDate: '2027-06-01' },
      weights([TODAY, AT_178.normal]),
      TODAY
    );
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('target-below-healthy-bmi');
    expect(r.suggestion).toBeDefined();
    // The suggestion must itself be safe.
    const suggestedBmi = r.suggestion!.targetKg / Math.pow(178 / 100, 2);
    expect(suggestedBmi).toBeGreaterThanOrEqual(MIN_SAFE_BMI);
  });

  it('refuses a crash-diet pace and offers a realistic date', () => {
    // 12kg in 30 days is ~2.8kg/week.
    const r = projectGoal(
      profile({ weightKg: 82 }),
      { targetKg: 70, targetDate: '2026-09-14' },
      weights([TODAY, 82]),
      TODAY
    );
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('too-fast');
    expect(r.suggestion?.targetKg).toBe(70);
    expect(r.suggestion!.targetDate > '2026-09-14').toBe(true);
  });

  it('refusing a pace still keeps the goal — only the date moves', () => {
    const r = projectGoal(
      profile({ weightKg: 82 }),
      { targetKg: 76, targetDate: '2026-08-29' },
      weights([TODAY, 82]),
      TODAY
    );
    expect(r.refusal).toBe('too-fast');
    // Accepting the suggestion must produce a plan that IS allowed.
    const retry = projectGoal(
      profile({ weightKg: 82 }),
      { targetKg: r.suggestion!.targetKg, targetDate: r.suggestion!.targetDate },
      weights([TODAY, 82]),
      TODAY
    );
    expect(retry.ok).toBe(true);
  });

  it('refuses a date in the past', () => {
    const r = projectGoal(profile(), { targetKg: 78, targetDate: '2026-01-01' }, [], TODAY);
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('date-in-past');
  });

  it.each([0, -5, NaN, Infinity])('refuses an invalid target (%o)', (kg) => {
    const r = projectGoal(profile(), { targetKg: kg as number, targetDate: '2026-12-01' }, [], TODAY);
    expect(r.ok).toBe(false);
    expect(r.refusal).toBe('invalid');
  });

  it('does NOT restrict gaining for an underweight user', () => {
    // The BMI floor exists to stop unsafe loss, not to block healthy gain.
    const r = projectGoal(
      profile({ weightKg: AT_178.underweight, goal: Goal.MuscleGain }),
      { targetKg: 62, targetDate: '2027-02-01' },
      weights([TODAY, AT_178.underweight]),
      TODAY
    );
    expect(r.ok).toBe(true);
    expect(r.direction).toBe('gain');
  });
});

describe('projectGoal — safe plans', () => {
  const safe = () => projectGoal(
    profile({ weightKg: 82 }),
    { targetKg: 78, targetDate: '2026-11-15' },   // 4kg over ~92 days
    weights([TODAY, 82]),
    TODAY
  );

  it('accepts a realistic goal', () => {
    const r = safe();
    expect(r.ok).toBe(true);
    expect(r.refusal).toBeUndefined();
    expect(r.direction).toBe('lose');
  });

  it('reports what is left and how long there is', () => {
    const r = safe();
    expect(r.remainingKg).toBe(4);
    expect(r.daysRemaining).toBe(92);
    expect(r.weeklyRateKg).toBeCloseTo(0.3, 1);
  });

  it('turns the goal into a daily calorie target below maintenance', () => {
    const r = safe();
    expect(r.dailyAdjustment).toBeLessThan(0);
    expect(r.dailyCalories).toBeLessThan(3000);
    expect(r.dailyCalories).toBeGreaterThanOrEqual(MIN_SAFE_CALORIES);
  });

  it('sets a surplus when gaining', () => {
    const r = projectGoal(
      profile({ weightKg: 70, goal: Goal.MuscleGain }),
      { targetKg: 74, targetDate: '2027-02-01' },
      weights([TODAY, 70]),
      TODAY
    );
    expect(r.direction).toBe('gain');
    expect(r.dailyAdjustment).toBeGreaterThan(0);
  });

  it('treats a sub-0.5kg delta as maintenance', () => {
    const r = projectGoal(
      profile({ weightKg: 78 }),
      { targetKg: 78.2, targetDate: '2026-12-01' },
      weights([TODAY, 78]),
      TODAY
    );
    expect(r.direction).toBe('maintain');
  });

  // ── Clamps: the maths must never win over the floor ─────────────────────
  it('never plans below the safe calorie floor', () => {
    // A small person on an aggressive-but-allowed timeline.
    const r = projectGoal(
      profile({ weightKg: 60, heightCm: 150, age: 60, gender: Gender.Female }),
      { targetKg: 57, targetDate: '2026-09-30' },
      weights([TODAY, 60]),
      TODAY
    );
    if (r.ok) expect(r.dailyCalories).toBeGreaterThanOrEqual(MIN_SAFE_CALORIES);
  });

  it('never plans a deficit larger than the cap', () => {
    const r = projectGoal(
      profile({ weightKg: 110 }),
      { targetKg: 105, targetDate: '2026-09-20' },
      weights([TODAY, 110]),
      TODAY
    );
    if (r.ok) expect(Math.abs(r.dailyAdjustment)).toBeLessThanOrEqual(MAX_DAILY_DEFICIT);
  });

  it('holds the floor across a wide sweep of profiles', () => {
    for (const weightKg of [45, 60, 82, 120]) {
      for (const heightCm of [150, 165, 185]) {
        for (const days of [30, 120, 365]) {
          const d = new Date(2026, 7, 15 + days);
          const r = projectGoal(
            profile({ weightKg, heightCm }),
            { targetKg: weightKg - 3, targetDate: d.toISOString().slice(0, 10) },
            weights([TODAY, weightKg]),
            TODAY
          );
          if (r.ok) {
            expect(r.dailyCalories, `${weightKg}kg/${heightCm}cm/${days}d`).toBeGreaterThanOrEqual(MIN_SAFE_CALORIES);
            expect(Number.isNaN(r.dailyCalories)).toBe(false);
          }
        }
      }
    }
  });
});

describe('projectGoal — pace tracking', () => {
  it('has no verdict until there is enough history', () => {
    const r = projectGoal(
      profile({ weightKg: 82 }), { targetKg: 78, targetDate: '2026-11-15' },
      weights([TODAY, 82]), TODAY
    );
    expect(r.paceKgPerWeek).toBeNull();
    expect(r.onTrack).toBeNull();
  });

  it('reads losing weight as on track for a loss goal', () => {
    const r = projectGoal(
      profile({ weightKg: 82 }), { targetKg: 78, targetDate: '2026-11-15' },
      weights(['2026-08-01', 83], ['2026-08-15', 82]), TODAY
    );
    expect(r.paceKgPerWeek).toBeLessThan(0);
    expect(r.onTrack).toBe(true);
  });

  it('reads gaining weight as off track for a loss goal', () => {
    const r = projectGoal(
      profile({ weightKg: 84 }), { targetKg: 78, targetDate: '2026-11-15' },
      weights(['2026-08-01', 82], ['2026-08-15', 84]), TODAY
    );
    expect(r.onTrack).toBe(false);
  });

  it('uses the latest weigh-in as current, not the profile', () => {
    const r = projectGoal(
      profile({ weightKg: 82 }), { targetKg: 78, targetDate: '2026-11-15' },
      weights(['2026-08-01', 82], ['2026-08-15', 80]), TODAY
    );
    expect(r.currentKg).toBe(80);
    expect(r.remainingKg).toBe(2);
  });
});
