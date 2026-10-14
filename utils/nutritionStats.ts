import { MealLog, UserProfile } from '../types';
import { isSameISODate } from './dateUtils';
import { computeConsumedMicros, scoreFromConsumed, sumMacros } from './nutritionAggregates';

/**
 * Ratio statistics over a date range, with a per-day series for each.
 *
 * These are deliberately RATIOS rather than totals. A total flatters a big day
 * and punishes a small one — 120g of protein means something different on a
 * 3000 kcal day than on a 1200 kcal one. Every number here is independent of
 * how much was eaten, which is what makes them comparable across days.
 *
 * Built from logs rather than DailyNutritionSummary because the summaries carry
 * no micros, and two of these four need them.
 */

export interface StatPoint {
  dateKey: string;
  /** Short weekday label for the axis. */
  label: string;
  /** null on days with no meals — a gap in the line, not a zero. */
  value: number | null;
}

export interface StatSeries {
  key: 'proteinDensity' | 'proteinPerKg' | 'nutrientDensity' | 'consistency';
  label: string;
  unit: string;
  /** What a good value looks like, for the reference line. */
  target: number;
  /** The explanation shown under the number. */
  blurb: string;
  /** Mean across logged days. */
  average: number;
  /** Mean of the first half vs the second half, for the direction arrow. */
  trend: 'up' | 'down' | 'flat';
  points: StatPoint[];
}

const weekday = (dateKey: string): string => {
  const d = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(d.getTime()) ? dateKey.slice(5) : d.toLocaleDateString('en-US', { weekday: 'short' });
};

const mean = (nums: number[]): number =>
  nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;

/**
 * Direction of travel: first half of the range against the second.
 *
 * Comparing endpoints would let one unusual day flip the arrow, which makes the
 * indicator noise rather than information.
 */
const trendOf = (values: number[]): 'up' | 'down' | 'flat' => {
  if (values.length < 4) return 'flat';
  const mid = Math.floor(values.length / 2);
  const first = mean(values.slice(0, mid));
  const second = mean(values.slice(mid));
  if (!first) return 'flat';
  const change = (second - first) / first;
  if (change > 0.08) return 'up';
  if (change < -0.08) return 'down';
  return 'flat';
};

/** Protein target basis used across the app: 1.6 g/kg, 2.0 for muscle gain. */
const proteinPerKgTarget = (profile: UserProfile): number =>
  String(profile?.goal ?? '').toLowerCase().includes('muscle') ? 2.0 : 1.6;

export const computeStatSeries = (
  logs: MealLog[],
  dateKeys: string[],
  profile: UserProfile,
): StatSeries[] => {
  const weightKg = Number(profile?.weightKg) || 0;

  // One pass over the range; every series reads from these per-day rows.
  const days = dateKeys.map((dateKey) => {
    const dayLogs = (logs ?? []).filter((l) => l.timestamp && isSameISODate(l.timestamp, dateKey));
    if (dayLogs.length === 0) return { dateKey, logged: false as const };
    const macros = sumMacros(dayLogs);
    const micros = computeConsumedMicros(dayLogs);
    return {
      dateKey,
      logged: true as const,
      calories: macros.calories,
      protein: macros.protein,
      microScore: scoreFromConsumed(micros),
    };
  });

  const build = (
    key: StatSeries['key'],
    label: string,
    unit: string,
    target: number,
    blurb: string,
    valueOf: (d: Extract<typeof days[number], { logged: true }>) => number | null,
  ): StatSeries => {
    const points: StatPoint[] = days.map((d) => ({
      dateKey: d.dateKey,
      label: weekday(d.dateKey),
      value: d.logged ? valueOf(d) : null,
    }));
    const real = points.map((p) => p.value).filter((v): v is number => v !== null && Number.isFinite(v));
    return {
      key, label, unit, target, blurb,
      average: real.length ? Math.round(mean(real) * 10) / 10 : 0,
      trend: trendOf(real),
      points,
    };
  };

  return [
    build(
      'proteinDensity', 'Protein density', 'g/1000kcal', 40,
      'Protein per 1000 calories. Independent of how much you ate, so a big day cannot flatter it.',
      (d) => (d.calories > 0 ? Math.round((d.protein / d.calories) * 1000 * 10) / 10 : null),
    ),
    build(
      'proteinPerKg', 'Protein per kg', 'g/kg', proteinPerKgTarget(profile),
      'The number that actually drives muscle retention, and the basis of your protein target.',
      (d) => (weightKg > 0 ? Math.round((d.protein / weightKg) * 100) / 100 : null),
    ),
    build(
      'nutrientDensity', 'Nutrient density', 'score/1000kcal', 50,
      'Micronutrient score per 1000 calories — how much nutrition each calorie carried.',
      (d) => (d.calories > 0 ? Math.round((d.microScore / d.calories) * 1000 * 10) / 10 : null),
    ),
    build(
      'consistency', 'Calories vs target', '%', 100,
      'How close each day landed to your calorie target. The habit metric.',
      (d) => Math.round(d.calories),
    ),
  ];
};

export interface ConsistencySummary {
  daysLogged: number;
  daysInRange: number;
  /** Logged days within 15% of the calorie target, either side. */
  daysOnTarget: number;
}

/**
 * How often the user logged, and how often they landed near target.
 *
 * "On target" is a BAND, not a ceiling: 15% either side. Counting only days
 * under target would score starving as perfect consistency, which is the same
 * mistake as letting the avatar get thinner when you skip meals.
 */
export const computeConsistency = (
  logs: MealLog[],
  dateKeys: string[],
  calorieTarget: number,
): ConsistencySummary => {
  let daysLogged = 0;
  let daysOnTarget = 0;
  const target = Number(calorieTarget) || 0;

  for (const dateKey of dateKeys) {
    const dayLogs = (logs ?? []).filter((l) => l.timestamp && isSameISODate(l.timestamp, dateKey));
    if (dayLogs.length === 0) continue;
    daysLogged++;
    if (target > 0) {
      const { calories } = sumMacros(dayLogs);
      if (Math.abs(calories - target) / target <= 0.15) daysOnTarget++;
    }
  }

  return { daysLogged, daysInRange: dateKeys.length, daysOnTarget };
};
