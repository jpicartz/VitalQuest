import { UserProfile, WeightEntry, StoredWeightGoal, MacroTargets } from '../types';
import { calculateMetrics, macrosFor } from './metricsUtils';
import { toISODateString, parseISODate } from './dateUtils';

/**
 * Weight-goal projection.
 *
 * SAFETY: the refusal rules in this file are the app's primary eating-disorder
 * guardrail, and they live here — in deterministic code — rather than in an AI
 * prompt. A calorie tracker with an AI coach has real ED exposure, and a system
 * prompt is the weakest possible place for the highest-severity rule.
 *
 * `targetsForDate` at the bottom of this file is the ONLY producer of daily
 * calorie and macro targets in the app. Everything downstream — Today's
 * remaining calories, the macro bars, the body-system scores, the trend lines,
 * the coach's prompt, the meal suggester — reads from it, so all of them
 * inherit these refusals by construction. That was not true before: each of
 * those surfaces read raw TDEE, and this comment claimed an inheritance the
 * code did not implement.
 */

/** ~7700 kcal per kg of body fat — the standard planning figure. */
const KCAL_PER_KG = 7700;

/** Below this BMI the app will not help you lose further. */
export const MIN_SAFE_BMI = 18.5;
/** Fraction of bodyweight per week the app is willing to plan for. */
export const MAX_WEEKLY_LOSS_FRACTION = 0.01;
/** Never plan a day below this, regardless of the maths. */
export const MIN_SAFE_CALORIES = 1200;
/** Largest daily deficit the app will plan. */
export const MAX_DAILY_DEFICIT = 750;

export type GoalDirection = 'lose' | 'gain' | 'maintain';

export interface WeightGoal {
  targetKg: number;
  /** ISO date the user wants to reach it by. */
  targetDate: string;
}

export type GoalRefusal =
  | 'below-healthy-bmi'
  | 'target-below-healthy-bmi'
  | 'too-fast'
  | 'date-in-past'
  | 'invalid';

export interface GoalProjection {
  ok: boolean;
  /** Set when ok === false. The UI shows `message` and offers `suggestion`. */
  refusal?: GoalRefusal;
  message?: string;
  /** A safe alternative the user can accept with one tap, when one exists. */
  suggestion?: { targetKg: number; targetDate: string };

  direction: GoalDirection;
  currentKg: number;
  targetKg: number;
  /** Kilograms still to go (always positive). */
  remainingKg: number;
  daysRemaining: number;
  /** Planned rate, kg per week. */
  weeklyRateKg: number;
  /** Daily calorie target after the deficit/surplus is applied. */
  dailyCalories: number;
  /** Signed: negative is a deficit. */
  dailyAdjustment: number;
  /** Projected date at the planned rate, which may differ from the request. */
  projectedDate: string;
  /** Positive = ahead of schedule, negative = behind. Null until 2+ weigh-ins. */
  paceKgPerWeek: number | null;
  onTrack: boolean | null;
}

const bmiFor = (kg: number, heightCm: number) => kg / Math.pow(heightCm / 100, 2);

const daysBetween = (fromISO: string, toISO: string) =>
  Math.round((parseISODate(toISO).getTime() - parseISODate(fromISO).getTime()) / 86_400_000);

const addDays = (iso: string, days: number) => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODateString(d);
};

/**
 * Observed rate of change from the weight log, in kg/week.
 * Returns null until there are two entries at least 7 days apart — anything
 * shorter is water weight, not a trend.
 */
export const observedPace = (history: WeightEntry[]): number | null => {
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = daysBetween(first.date, last.date);
  if (days < 7) return null;
  const deltaKg = Number(last.kg) - Number(first.kg);
  if (!Number.isFinite(deltaKg)) return null;
  return Math.round((deltaKg / days) * 7 * 100) / 100;
};

/**
 * Project a weight goal, refusing anything unsafe.
 *
 * `todayISO` is injectable so the projection is testable without faking time.
 */
export const projectGoal = (
  profile: UserProfile,
  goal: WeightGoal,
  history: WeightEntry[],
  todayISO: string = toISODateString()
): GoalProjection => {
  const currentKg = history.length
    ? Number([...history].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0].kg)
    : Number(profile.weightKg);

  const targetKg = Number(goal.targetKg);
  const heightCm = Number(profile.heightCm);
  const pace = observedPace(history);

  const base = {
    direction: 'maintain' as GoalDirection,
    currentKg,
    targetKg,
    remainingKg: 0,
    daysRemaining: 0,
    weeklyRateKg: 0,
    dailyCalories: calculateMetrics(profile).tdee,
    dailyAdjustment: 0,
    projectedDate: todayISO,
    paceKgPerWeek: pace,
    onTrack: null as boolean | null,
  };

  const refuse = (refusal: GoalRefusal, message: string, suggestion?: GoalProjection['suggestion']) =>
    ({ ...base, ok: false, refusal, message, suggestion });

  if (!Number.isFinite(targetKg) || targetKg <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) {
    return refuse('invalid', 'That target does not look right. Enter a weight in kilograms.');
  }

  const daysRemaining = daysBetween(todayISO, goal.targetDate);
  if (daysRemaining <= 0) {
    return refuse('date-in-past', 'Pick a date in the future so there is time to get there.');
  }

  const deltaKg = targetKg - currentKg;
  const direction: GoalDirection =
    Math.abs(deltaKg) < 0.5 ? 'maintain' : deltaKg < 0 ? 'lose' : 'gain';
  const remainingKg = Math.abs(deltaKg);

  // ── Refusals, strictest first ────────────────────────────────────────────

  // 1. Already at or below a healthy BMI and still trying to lose.
  if (direction === 'lose' && bmiFor(currentKg, heightCm) < MIN_SAFE_BMI) {
    return refuse(
      'below-healthy-bmi',
      'Your current weight is already below the healthy BMI range, so this app will not plan further weight loss. Please talk to a doctor or a registered dietitian.'
    );
  }

  // 2. The target itself lands below a healthy BMI.
  if (direction === 'lose' && bmiFor(targetKg, heightCm) < MIN_SAFE_BMI) {
    const safeKg = Math.ceil(MIN_SAFE_BMI * Math.pow(heightCm / 100, 2) * 10) / 10;
    return refuse(
      'target-below-healthy-bmi',
      `A target of ${targetKg} kg would put you below the healthy BMI range. The lowest weight this app will plan for at your height is ${safeKg} kg.`,
      { targetKg: safeKg, targetDate: goal.targetDate }
    );
  }

  // 3. The requested rate is faster than the app will plan.
  const weeklyRateKg = remainingKg / (daysRemaining / 7);
  const maxWeekly = currentKg * MAX_WEEKLY_LOSS_FRACTION;
  if (direction !== 'maintain' && weeklyRateKg > maxWeekly) {
    const safeDays = Math.ceil((remainingKg / maxWeekly) * 7);
    return refuse(
      'too-fast',
      `That pace is about ${weeklyRateKg.toFixed(1)} kg per week. This app plans at most ${maxWeekly.toFixed(1)} kg per week — roughly 1% of bodyweight — because faster than that tends to cost muscle and rarely lasts.`,
      { targetKg, targetDate: addDays(todayISO, safeDays) }
    );
  }

  // ── Safe: build the plan ─────────────────────────────────────────────────

  const tdee = calculateMetrics(profile).tdee;
  const rawDaily = (deltaKg * KCAL_PER_KG) / daysRemaining;
  const dailyAdjustment = Math.round(
    Math.max(-MAX_DAILY_DEFICIT, Math.min(rawDaily, MAX_DAILY_DEFICIT))
  );
  // The floor wins over the arithmetic, always.
  const dailyCalories = Math.max(MIN_SAFE_CALORIES, Math.round(tdee + dailyAdjustment));

  const onTrack =
    pace === null || direction === 'maintain'
      ? null
      : direction === 'lose'
        ? pace <= 0
        : pace >= 0;

  return {
    ...base,
    ok: true,
    direction,
    remainingKg: Math.round(remainingKg * 10) / 10,
    daysRemaining,
    weeklyRateKg: Math.round(weeklyRateKg * 100) / 100,
    dailyCalories,
    dailyAdjustment,
    projectedDate: goal.targetDate,
    paceKgPerWeek: pace,
    onTrack,
  };
};

/**
 * The calorie and macro targets in force on a given day.
 *
 * The single source of daily targets. Three things it guarantees:
 *
 *   1. Maintenance is computed from the profile's CURRENT weight, so targets
 *      follow a weigh-in instead of staying pinned to the onboarding snapshot.
 *   2. A goal governs only days from the one it was set on. Earlier days keep
 *      the target they were logged against, so editing a goal never rewrites
 *      how a past day reads.
 *   3. A refused goal yields maintenance, never a deficit. The guardrails
 *      cannot be sidestepped by reading targets instead of the projection —
 *      which is the whole reason this function lives in this file.
 */
export const targetsForDate = (
  profile: UserProfile,
  goal: StoredWeightGoal | null,
  forDateISO: string,
  history: WeightEntry[] = [],
): MacroTargets => {
  const base = calculateMetrics(profile);
  const maintenance: MacroTargets = { calories: base.tdee, ...base.macros };

  if (!goal) return maintenance;
  // ISO dates compare correctly as strings, so no parsing is needed here.
  if (forDateISO < goal.setOn) return maintenance;

  const projection = projectGoal(profile, goal, history, forDateISO);
  if (!projection.ok) return maintenance;

  return { calories: projection.dailyCalories, ...macrosFor(profile, projection.dailyCalories) };
};

/**
 * How far the day's target sits from plain maintenance, for the UI to explain
 * itself. Returns null when no goal is in force — the caller then says nothing
 * rather than displaying "0 below maintenance".
 */
export const goalAdjustmentForDate = (
  profile: UserProfile,
  goal: StoredWeightGoal | null,
  forDateISO: string,
  history: WeightEntry[] = [],
): number | null => {
  if (!goal || forDateISO < goal.setOn) return null;
  const projection = projectGoal(profile, goal, history, forDateISO);
  if (!projection.ok) return null;
  const maintenance = calculateMetrics(profile).tdee;
  const delta = projection.dailyCalories - maintenance;
  return delta === 0 ? null : delta;
};
