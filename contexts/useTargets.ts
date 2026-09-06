import { useMemo } from 'react';
import { MacroTargets } from '../types';
import { targetsForDate, goalAdjustmentForDate } from '../utils/goalProjection';
import { useProfile } from './ProfileContext';
import { useLogs } from './LogsContext';

/**
 * The calorie and macro targets in force for the day being viewed.
 *
 * `profile` lives in ProfileContext while `weightGoal` and `selectedDate` live
 * in LogsContext, so the two halves never met — which is exactly why the weight
 * goal was unable to affect any target. This hook joins them without collapsing
 * the split, which exists so a water click does not re-render profile consumers.
 *
 * Pass a date to ask about a specific day; omit it for the day on screen.
 */
export const useTargets = (forDateISO?: string): MacroTargets => {
  const { profile } = useProfile();
  const { weightGoal, selectedDate, weightHistory } = useLogs();
  const date = forDateISO ?? selectedDate;
  return useMemo(
    () => targetsForDate(profile, weightGoal, date, weightHistory),
    [profile, weightGoal, date, weightHistory],
  );
};

/**
 * How far that day's target sits from maintenance, or null when no goal is in
 * force. Null means the UI should say nothing at all, rather than explaining a
 * zero adjustment.
 */
export const useGoalAdjustment = (forDateISO?: string): number | null => {
  const { profile } = useProfile();
  const { weightGoal, selectedDate, weightHistory } = useLogs();
  const date = forDateISO ?? selectedDate;
  return useMemo(
    () => goalAdjustmentForDate(profile, weightGoal, date, weightHistory),
    [profile, weightGoal, date, weightHistory],
  );
};
