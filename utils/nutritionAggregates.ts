import { MealLog } from '../types';
import { toISODateString, isSameISODate } from './dateUtils';
import { NUTRIENT_INFO } from '../data/nutrientData';

/** Canonical priority micronutrients used for the score and snapshot bar. */
export const PRIORITY_MICROS = [
  'Fiber', 'Vitamin C', 'Vitamin D', 'Magnesium', 'Potassium',
  'Iron', 'Calcium', 'Vitamin B12', 'Zinc', 'Omega-3',
] as const;

/**
 * Total micronutrient intake across a set of logs, keyed by canonical nutrient
 * name. Optionally filtered to a single calendar day.
 *
 * This is the SINGLE aggregation path. Every surface that shows a micronutrient
 * number must go through it — the score, the snapshot, the breakdown grid and
 * the body-system scores. Previously `NutritionTracker` maintained its own copy
 * of this loop with a weaker coercion, so the page could show `NaN% DV` in the
 * tiles directly beneath a correct score.
 */
export const computeConsumedMicros = (
  logs: MealLog[],
  dateISO?: string
): Record<string, number> => {
  const relevant = dateISO
    ? logs.filter(l => l.timestamp && isSameISODate(l.timestamp, dateISO))
    : logs;

  const consumed: Record<string, number> = {};
  relevant.forEach(log => {
    if (log.food.micros) {
      Object.entries(log.food.micros).forEach(([key, val]) => {
        // `Number(val) || 0`, NOT `Number(val || 0)`. The AI sometimes returns
        // "28g" instead of 28; the latter form yields NaN, which then poisons
        // every total it is added to.
        consumed[key] = (consumed[key] || 0) + (Number(val) || 0);
      });
    }
  });
  return consumed;
};

/**
 * Compute the Micronutrient Score (0–100) for a set of food logs.
 * If `dateISO` is provided, only logs for that calendar day are included.
 *
 * Kept as the canonical aggregate even after body-system scores land: it is the
 * input to the `nutrition-nerd` badge, and body systems are a presentation
 * layer over the same consumed map rather than a replacement for it.
 */
export const computeMicroScore = (logs: MealLog[], dateISO?: string): number => {
  const consumed = computeConsumedMicros(logs, dateISO);

  let totalRatio = 0;
  let count = 0;
  PRIORITY_MICROS.forEach(key => {
    const info = NUTRIENT_INFO[key];
    if (!info?.targetVal) return;
    // Clamp each ratio to 0..1 — Math.min alone lets a negative value through
    // and drags the whole score below zero.
    const ratio = (consumed[key] || 0) / info.targetVal;
    totalRatio += Math.max(0, Math.min(ratio, 1));
    count++;
  });

  return count === 0 ? 0 : Math.round((totalRatio / count) * 100);
};

export interface DailyNutritionSummary {
  label: string;
  dateKey: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
}

export interface WeeklyMacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// Same NaN guard as computeMicroScore: `Number(x) || 0` coerces a stray
// "350 kcal" to 0 rather than poisoning every downstream total with NaN.
const sumDayLogs = (logs: MealLog[]) =>
  logs.reduce(
    (acc, log) => ({
      calories: acc.calories + (Number(log.food.calories) || 0),
      protein: acc.protein + (Number(log.food.protein) || 0),
      carbs: acc.carbs + (Number(log.food.carbs) || 0),
      fat: acc.fat + (Number(log.food.fat) || 0),
      mealCount: acc.mealCount + 1,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, mealCount: 0 }
  );

/** Last N calendar days (oldest → newest), including days with zero logs. */
export const getLastNDaysSummaries = (logs: MealLog[], days = 7): DailyNutritionSummary[] => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const summaries: DailyNutritionSummary[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = toISODateString(d);
    const dayLogs = logs.filter(
      (log) => log.timestamp && isSameISODate(log.timestamp, dateKey)
    );
    const totals = sumDayLogs(dayLogs);
    summaries.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dateKey,
      ...totals,
    });
  }

  return summaries;
};

export const getWeeklyMacroTotals = (summaries: DailyNutritionSummary[]): WeeklyMacroTotals =>
  summaries.reduce(
    (acc, day) => ({
      calories: acc.calories + day.calories,
      protein: acc.protein + day.protein,
      carbs: acc.carbs + day.carbs,
      fat: acc.fat + day.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

export type InsightsPayload = ReturnType<typeof buildInsightsPayload>;

/** Compact payload for Claude pattern analysis (token-efficient). */
export const buildInsightsPayload = (
  summaries: DailyNutritionSummary[],
  calorieTarget: number,
  proteinTarget: number
) => {
  const loggedDays = summaries.filter((d) => d.mealCount > 0);
  const weekly = getWeeklyMacroTotals(summaries);
  const avgCalories =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
      : 0;
  const avgProtein =
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((s, d) => s + d.protein, 0) / loggedDays.length)
      : 0;

  return {
    // Derived, not hardcoded — this string is sent to Claude, and the caller
    // also feeds 14- and 30-day ranges. Saying "last_7_days" for a 30-day
    // window tells the model the wrong thing about its own input.
    period: `last_${summaries.length}_days`,
    daysLogged: loggedDays.length,
    calorieTarget,
    proteinTarget,
    avgDailyCalories: avgCalories,
    avgDailyProtein: avgProtein,
    weeklyTotals: weekly,
    dailyBreakdown: summaries.map((d) => ({
      day: d.label,
      calories: Math.round(d.calories),
      protein: Math.round(d.protein),
      carbs: Math.round(d.carbs),
      fat: Math.round(d.fat),
      meals: d.mealCount,
    })),
  };
};
