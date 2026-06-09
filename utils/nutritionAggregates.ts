import { MealLog } from '../types';
import { toISODateString, isSameISODate } from './dateUtils';

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

const sumDayLogs = (logs: MealLog[]) =>
  logs.reduce(
    (acc, log) => ({
      calories: acc.calories + Number(log.food.calories || 0),
      protein: acc.protein + Number(log.food.protein || 0),
      carbs: acc.carbs + Number(log.food.carbs || 0),
      fat: acc.fat + Number(log.food.fat || 0),
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
    period: 'last_7_days',
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
