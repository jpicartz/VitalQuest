import { describe, it, expect } from 'vitest';
import { computeStatSeries, computeConsistency } from './nutritionStats';
import { aProfile, aMealLog, aFood } from '../test/fixtures';
import { MealLog } from '../types';

const DAYS = ['2026-07-29', '2026-07-30', '2026-07-31'];

/** 80kg profile so protein-per-kg is easy to reason about. */
const profile = aProfile({ weightKg: 80 });

const dayLog = (dateISO: string, over: Parameters<typeof aFood>[0] = {}): MealLog =>
  aMealLog({ food: aFood(over) }, dateISO);

describe('computeStatSeries', () => {
  it('returns one series per stat, in a stable order', () => {
    const s = computeStatSeries([], DAYS, profile);
    expect(s.map((x) => x.key)).toEqual([
      'proteinDensity', 'proteinPerKg', 'nutrientDensity', 'consistency',
    ]);
  });

  it('computes protein density independently of how much was eaten', () => {
    // Same ratio, very different day sizes: 40g/1000kcal both times.
    const logs = [
      dayLog(DAYS[0], { calories: 1000, protein: 40 }),
      dayLog(DAYS[1], { calories: 3000, protein: 120 }),
    ];
    const density = computeStatSeries(logs, DAYS, profile).find((s) => s.key === 'proteinDensity')!;
    expect(density.points[0].value).toBe(40);
    expect(density.points[1].value).toBe(40);
    expect(density.average).toBe(40);
  });

  it('computes protein per kg from the profile weight', () => {
    const logs = [dayLog(DAYS[0], { calories: 2000, protein: 128 })]; // 1.6 g/kg at 80kg
    const perKg = computeStatSeries(logs, DAYS, profile).find((s) => s.key === 'proteinPerKg')!;
    expect(perKg.points[0].value).toBe(1.6);
    expect(perKg.target).toBe(1.6);
  });

  it('leaves unlogged days as null so the chart breaks the line', () => {
    // Interpolating across a gap would invent data on exactly the days the
    // user did not give any.
    const logs = [dayLog(DAYS[1], { calories: 2000, protein: 100 })];
    const density = computeStatSeries(logs, DAYS, profile).find((s) => s.key === 'proteinDensity')!;
    expect(density.points.map((p) => p.value === null)).toEqual([true, false, true]);
  });

  it('averages only the logged days', () => {
    const logs = [dayLog(DAYS[0], { calories: 1000, protein: 50 })]; // 50 g/1000kcal
    const density = computeStatSeries(logs, DAYS, profile).find((s) => s.key === 'proteinDensity')!;
    expect(density.average).toBe(50);
  });

  it('returns 0 rather than NaN when nothing is logged', () => {
    for (const s of computeStatSeries([], DAYS, profile)) {
      expect(Number.isFinite(s.average)).toBe(true);
      expect(s.average).toBe(0);
      expect(s.trend).toBe('flat');
    }
  });

  it('survives a zero-calorie day without dividing by zero', () => {
    const logs = [dayLog(DAYS[0], { calories: 0, protein: 0 })];
    const density = computeStatSeries(logs, DAYS, profile).find((s) => s.key === 'proteinDensity')!;
    expect(density.points[0].value).toBeNull();
    expect(Number.isFinite(density.average)).toBe(true);
  });

  it('raises the protein target for a muscle-gain goal', () => {
    const gain = computeStatSeries([], DAYS, aProfile({ goal: 'Muscle Gain' } as never));
    expect(gain.find((s) => s.key === 'proteinPerKg')!.target).toBe(2.0);
  });

  it('reports trend from halves, so one odd day cannot flip it', () => {
    const SIX = ['2026-07-26','2026-07-27','2026-07-28','2026-07-29','2026-07-30','2026-07-31'];
    // Low first half, high second half.
    const logs = SIX.map((d, i) => dayLog(d, { calories: 2000, protein: i < 3 ? 40 : 160 }));
    const density = computeStatSeries(logs, SIX, profile).find((s) => s.key === 'proteinDensity')!;
    expect(density.trend).toBe('up');
  });

  it('calls a short range flat rather than guessing a direction', () => {
    const logs = [dayLog(DAYS[0], { calories: 2000, protein: 40 })];
    expect(computeStatSeries(logs, DAYS, profile)[0].trend).toBe('flat');
  });
});

describe('computeConsistency', () => {
  it('counts logged days and days within 15% of target, either side', () => {
    const logs = [
      dayLog(DAYS[0], { calories: 2000 }),  // exactly on target
      dayLog(DAYS[1], { calories: 1500 }),  // 25% under — not on target
      dayLog(DAYS[2], { calories: 2250 }),  // 12.5% over — on target
    ];
    expect(computeConsistency(logs, DAYS, 2000)).toEqual({
      daysLogged: 3, daysInRange: 3, daysOnTarget: 2,
    });
  });

  it('does not score undereating as perfect consistency', () => {
    // The band is deliberately two-sided. A one-sided "at or under target"
    // check would make starving look like flawless adherence.
    const logs = DAYS.map((d) => dayLog(d, { calories: 400 }));
    expect(computeConsistency(logs, DAYS, 2000).daysOnTarget).toBe(0);
  });

  it('ignores days with no meals', () => {
    const logs = [dayLog(DAYS[0], { calories: 2000 })];
    expect(computeConsistency(logs, DAYS, 2000)).toEqual({
      daysLogged: 1, daysInRange: 3, daysOnTarget: 1,
    });
  });

  it('returns zeros rather than dividing by a zero target', () => {
    const logs = [dayLog(DAYS[0], { calories: 2000 })];
    expect(computeConsistency(logs, DAYS, 0).daysOnTarget).toBe(0);
  });
});
