import { describe, it, expect } from 'vitest';
import { calculateMetrics } from './metricsUtils';
import { UserProfile, Gender, ActivityLevel, Goal } from '../types';

const profile = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 30,
  gender: Gender.Male,
  heightCm: 180,
  weightKg: 80,
  activityLevel: ActivityLevel.Sedentary,
  goal: Goal.GeneralHealth,
  dietaryRestrictions: [],
  medicationsOrConditions: '',
  sleepHours: 8,
  ...over,
});

describe('calculateMetrics — BMR (Mifflin-St Jeor)', () => {
  it('computes male BMR: 10w + 6.25h - 5a + 5', () => {
    // 800 + 1125 - 150 + 5 = 1780
    expect(calculateMetrics(profile()).bmr).toBe(1780);
  });

  it('computes female BMR: 10w + 6.25h - 5a - 161', () => {
    // 800 + 1125 - 150 - 161 = 1614
    expect(calculateMetrics(profile({ gender: Gender.Female })).bmr).toBe(1614);
  });

  it('applies the female constant to PreferNotToSay', () => {
    // Documents current behaviour: the sex constant is a string comparison
    // against 'Male', so anything else takes -161. Intentional-until-decided.
    expect(calculateMetrics(profile({ gender: Gender.PreferNotToSay })).bmr).toBe(1614);
  });
});

describe('calculateMetrics — activity multiplier', () => {
  it.each([
    [ActivityLevel.Sedentary, 1.2],
    [ActivityLevel.Light, 1.375],
    [ActivityLevel.Moderate, 1.55],
    [ActivityLevel.VeryActive, 1.725],
    [ActivityLevel.ExtraActive, 1.9],
  ])('%s applies a %fx multiplier', (activityLevel, multiplier) => {
    expect(calculateMetrics(profile({ activityLevel })).tdee).toBe(Math.round(1780 * multiplier));
  });

  it.each([
    [3000, 1.2],
    [6000, 1.375],
    [9000, 1.55],
    [12000, 1.725],
    [20000, 1.9],
  ])('dailySteps of %i overrides activityLevel and uses %fx', (dailySteps, multiplier) => {
    // A measured step count beats a self-reported bucket: VeryActive is ignored.
    const m = calculateMetrics(profile({ dailySteps, activityLevel: ActivityLevel.VeryActive }));
    expect(m.tdee).toBe(Math.round(1780 * multiplier));
  });

  it('falls back to activityLevel when dailySteps is 0 or absent', () => {
    const expected = Math.round(1780 * 1.55);
    expect(calculateMetrics(profile({ dailySteps: 0, activityLevel: ActivityLevel.Moderate })).tdee).toBe(expected);
    expect(calculateMetrics(profile({ activityLevel: ActivityLevel.Moderate })).tdee).toBe(expected);
  });
});

describe('calculateMetrics — goal adjustment', () => {
  it('subtracts 500 kcal for fat loss', () => {
    expect(calculateMetrics(profile({ goal: Goal.FatLoss })).tdee).toBe(Math.round(1780 * 1.2 - 500));
  });

  it('adds 300 kcal for muscle gain', () => {
    expect(calculateMetrics(profile({ goal: Goal.MuscleGain })).tdee).toBe(Math.round(1780 * 1.2 + 300));
  });

  it.each([Goal.GeneralHealth, Goal.Endurance])('leaves %s unadjusted', (goal) => {
    expect(calculateMetrics(profile({ goal })).tdee).toBe(Math.round(1780 * 1.2));
  });
});

describe('calculateMetrics — BMI', () => {
  it('computes weight / height²', () => {
    // 80 / 1.8² = 24.69
    expect(calculateMetrics(profile()).bmi).toBeCloseTo(24.69, 2);
  });

  it.each([
    [55, 'Underweight'],  // 16.98
    [70, 'Normal'],       // 21.60
    [90, 'Overweight'],   // 27.78
  ])('categorises %ikg as %s', (weightKg, category) => {
    expect(calculateMetrics(profile({ weightKg })).bmiCategory).toBe(category);
  });

  it('treats the 18.5 and 25 boundaries as the lower bound of the next band', () => {
    const at18_5 = profile({ heightCm: 200, weightKg: 74 });   // exactly 18.5
    expect(calculateMetrics(at18_5).bmiCategory).toBe('Normal');
    const at25 = profile({ heightCm: 200, weightKg: 100 });    // exactly 25
    expect(calculateMetrics(at25).bmiCategory).toBe('Overweight');
  });
});

describe('calculateMetrics — macro targets', () => {
  it('sets protein at 1.6 g/kg by default', () => {
    expect(calculateMetrics(profile()).macros.protein).toBe(128); // 80 * 1.6
  });

  it('raises protein to 2.0 g/kg for muscle gain', () => {
    expect(calculateMetrics(profile({ goal: Goal.MuscleGain })).macros.protein).toBe(160);
  });

  it('sets fat at 25% of calories', () => {
    const m = calculateMetrics(profile());
    expect(m.macros.fat).toBe(Math.round((1780 * 1.2 * 0.25) / 9));
  });

  it('fills the remaining calories with carbs', () => {
    const m = calculateMetrics(profile());
    const tdee = 1780 * 1.2;
    expect(m.macros.carbs).toBe(Math.round((tdee - m.macros.protein * 4 - m.macros.fat * 9) / 4));
  });

  // ── Regression: carbs could go negative ──────────────────────────────────
  it('never returns a negative carb target', () => {
    // A heavy, sedentary, short user in a deficit: protein + fat alone can
    // exceed the calorie target, which used to yield negative carbs.
    const extreme = profile({ weightKg: 200, heightCm: 150, age: 70, goal: Goal.FatLoss });
    expect(calculateMetrics(extreme).macros.carbs).toBeGreaterThanOrEqual(0);
  });

  it('keeps all macro targets non-negative across a wide range of profiles', () => {
    for (const weightKg of [40, 80, 150, 250]) {
      for (const goal of [Goal.FatLoss, Goal.MuscleGain, Goal.GeneralHealth]) {
        const { macros } = calculateMetrics(profile({ weightKg, goal, heightCm: 155 }));
        expect(macros.protein).toBeGreaterThanOrEqual(0);
        expect(macros.fat).toBeGreaterThanOrEqual(0);
        expect(macros.carbs).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
