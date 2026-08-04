import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeMicroScore,
  getLastNDaysSummaries,
  getWeeklyMacroTotals,
  buildInsightsPayload,
  PRIORITY_MICROS,
  DailyNutritionSummary,
} from './nutritionAggregates';
import { NUTRIENT_INFO } from '../data/nutrientData';
import { MealLog, FoodItem } from '../types';
import { timestampForISODate } from './dateUtils';

/** A log whose micros hit exactly 100% of every priority target. */
const perfectMicros = (): Record<string, number> =>
  Object.fromEntries(PRIORITY_MICROS.map((k) => [k, NUTRIENT_INFO[k].targetVal!]));

const food = (over: Partial<FoodItem> = {}): FoodItem => ({
  id: 'f1',
  name: 'Test Food',
  servingSize: '1 serving',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  micros: {},
  ...over,
});

const log = (f: Partial<FoodItem>, dateISO = '2026-07-31'): MealLog => ({
  id: `log-${Math.random()}`,
  type: 'Breakfast',
  food: food(f),
  timestamp: timestampForISODate(dateISO),
});

describe('computeMicroScore', () => {
  it('returns 0 with no logs', () => {
    expect(computeMicroScore([])).toBe(0);
  });

  it('returns 100 when every priority micronutrient hits its target', () => {
    expect(computeMicroScore([log({ micros: perfectMicros() })])).toBe(100);
  });

  it('returns 50 at half of every target', () => {
    const half = Object.fromEntries(
      Object.entries(perfectMicros()).map(([k, v]) => [k, v / 2])
    );
    expect(computeMicroScore([log({ micros: half })])).toBe(50);
  });

  it('caps each nutrient at 100% so megadosing one cannot inflate the score', () => {
    const oneHuge = { Fiber: NUTRIENT_INFO.Fiber.targetVal! * 1000 };
    // 1 of 10 priority micros satisfied, capped at 1.0 → 10.
    expect(computeMicroScore([log({ micros: oneHuge })])).toBe(10);
  });

  it('sums the same nutrient across multiple logs', () => {
    const target = NUTRIENT_INFO.Fiber.targetVal!;
    const score = computeMicroScore([
      log({ micros: { Fiber: target / 2 } }),
      log({ micros: { Fiber: target / 2 } }),
    ]);
    expect(score).toBe(10); // Fiber fully satisfied = 1/10 of the score
  });

  it('filters to a single day when dateISO is given', () => {
    const logs = [
      log({ micros: perfectMicros() }, '2026-07-31'),
      log({ micros: perfectMicros() }, '2026-07-30'),
    ];
    expect(computeMicroScore(logs, '2026-07-31')).toBe(100);
    expect(computeMicroScore(logs, '2026-07-29')).toBe(0);
  });

  it('ignores nutrients outside the priority list', () => {
    expect(computeMicroScore([log({ micros: { Sodium: 99999, Biotin: 500 } })])).toBe(0);
  });

  // ── String-valued micronutrients ─────────────────────────────────────────
  // The AI sometimes returns "28g" instead of 28. Here the old
  // `Number(val || 0)` form did produce a NaN accumulator, but the `|| 0` on
  // the *read* side (`consumed[key] || 0`) happened to rescue it, so the score
  // was never actually NaN. The current `Number(val) || 0` makes that explicit
  // rather than accidental. These tests pin the behaviour either way.
  it('treats a string-valued micronutrient as 0 instead of returning NaN', () => {
    const score = computeMicroScore([log({ micros: { Fiber: '28g' } as never })]);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  it('does not let one unparseable value poison the whole score', () => {
    const micros = { ...perfectMicros(), Fiber: '28g' } as never;
    const score = computeMicroScore([log({ micros })]);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(90); // the other 9 still count
  });

  it.each([null, undefined, '', 'abc', {}])('coerces %o to 0 without NaN', (bad) => {
    const score = computeMicroScore([log({ micros: { Fiber: bad } as never })]);
    expect(Number.isNaN(score)).toBe(false);
    expect(score).toBe(0);
  });

  // ── Regression: no lower clamp ───────────────────────────────────────────
  it('never returns a negative score for a negative value', () => {
    expect(computeMicroScore([log({ micros: { Fiber: -99999 } })])).toBe(0);
  });

  it('does not let a negative value cancel out legitimate intake', () => {
    const micros = { ...perfectMicros(), Fiber: -99999 };
    expect(computeMicroScore([log({ micros })])).toBe(90);
  });

  it('stays within 0..100 for arbitrary input', () => {
    for (const micros of [perfectMicros(), { Fiber: -1 }, { Zinc: 1e9 }, {}]) {
      const score = computeMicroScore([log({ micros })]);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('every priority micronutrient has a target, so all 10 count', () => {
    // If one lost its targetVal the denominator would silently shrink and
    // every score would jump. This pins the invariant.
    for (const key of PRIORITY_MICROS) {
      expect(NUTRIENT_INFO[key]?.targetVal, `${key} is missing targetVal`).toBeGreaterThan(0);
    }
    expect(PRIORITY_MICROS).toHaveLength(10);
  });
});

describe('getLastNDaysSummaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns the requested number of days, oldest first', () => {
    const s = getLastNDaysSummaries([], 7);
    expect(s).toHaveLength(7);
    expect(s[0].dateKey).toBe('2026-07-25');
    expect(s[6].dateKey).toBe('2026-07-31');
  });

  it('includes days with no logs as zeroed entries', () => {
    const s = getLastNDaysSummaries([], 3);
    expect(s.every((d) => d.calories === 0 && d.mealCount === 0)).toBe(true);
  });

  it('attributes a log to the correct day', () => {
    const s = getLastNDaysSummaries([log({ calories: 500, protein: 30 }, '2026-07-30')], 3);
    const day = s.find((d) => d.dateKey === '2026-07-30')!;
    expect(day.calories).toBe(500);
    expect(day.protein).toBe(30);
    expect(day.mealCount).toBe(1);
  });

  it('excludes logs outside the window', () => {
    const s = getLastNDaysSummaries([log({ calories: 500 }, '2026-01-01')], 7);
    expect(s.reduce((t, d) => t + d.calories, 0)).toBe(0);
  });

  it('returns an empty array for 0 or negative days', () => {
    expect(getLastNDaysSummaries([], 0)).toEqual([]);
    expect(getLastNDaysSummaries([], -5)).toEqual([]);
  });

  it('coerces a string calorie value to 0 rather than NaN', () => {
    const s = getLastNDaysSummaries([log({ calories: '500 kcal' as never }, '2026-07-31')], 1);
    expect(Number.isNaN(s[0].calories)).toBe(false);
    expect(s[0].calories).toBe(0);
  });
});

describe('getWeeklyMacroTotals', () => {
  const day = (over: Partial<DailyNutritionSummary> = {}): DailyNutritionSummary => ({
    label: 'Mon', dateKey: '2026-07-27', calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, ...over,
  });

  it('sums every macro across days', () => {
    const totals = getWeeklyMacroTotals([
      day({ calories: 2000, protein: 100, carbs: 200, fat: 60 }),
      day({ calories: 1800, protein: 120, carbs: 180, fat: 50 }),
    ]);
    expect(totals).toEqual({ calories: 3800, protein: 220, carbs: 380, fat: 110 });
  });

  it('returns zeros for an empty range', () => {
    expect(getWeeklyMacroTotals([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
});

describe('buildInsightsPayload', () => {
  const day = (over: Partial<DailyNutritionSummary> = {}): DailyNutritionSummary => ({
    label: 'Mon', dateKey: '2026-07-27', calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0, ...over,
  });

  it('averages over days actually logged, not days elapsed', () => {
    // Two logged days at 2000 each plus five empty days averages 2000, not ~571.
    const summaries = [
      day({ calories: 2000, protein: 100, mealCount: 3 }),
      day({ calories: 2000, protein: 140, mealCount: 3 }),
      ...Array.from({ length: 5 }, () => day()),
    ];
    const payload = buildInsightsPayload(summaries, 2100, 120);
    expect(payload.daysLogged).toBe(2);
    expect(payload.avgDailyCalories).toBe(2000);
    expect(payload.avgDailyProtein).toBe(120);
  });

  it('returns zero averages rather than NaN when nothing is logged', () => {
    const payload = buildInsightsPayload([day(), day()], 2100, 120);
    expect(payload.avgDailyCalories).toBe(0);
    expect(payload.avgDailyProtein).toBe(0);
  });

  // ── Regression: the period label was hardcoded to last_7_days ────────────
  it('reports the actual window length, not a hardcoded 7 days', () => {
    expect(buildInsightsPayload(Array.from({ length: 30 }, () => day()), 2100, 120).period)
      .toBe('last_30_days');
    expect(buildInsightsPayload(Array.from({ length: 7 }, () => day()), 2100, 120).period)
      .toBe('last_7_days');
  });

  it('passes targets through and rounds the daily breakdown', () => {
    const payload = buildInsightsPayload([day({ calories: 1999.6, mealCount: 1 })], 2100, 120);
    expect(payload.calorieTarget).toBe(2100);
    expect(payload.proteinTarget).toBe(120);
    expect(payload.dailyBreakdown[0].calories).toBe(2000);
  });
});
