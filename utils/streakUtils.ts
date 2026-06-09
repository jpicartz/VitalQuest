import { GamificationState } from '../types';

/**
 * Call this whenever the user successfully logs food.
 * Compares today's ISO date to lastLogDate and updates streak accordingly:
 *   - Same day  → no change
 *   - Yesterday → streak + 1
 *   - Older / no date → streak reset to 1
 */
export const updateStreak = (state: GamificationState, todayISO: string): GamificationState => {
  const { lastLogDate, streak } = state;

  if (!lastLogDate) {
    // First ever log
    return { ...state, streak: 1, lastLogDate: todayISO };
  }

  if (lastLogDate === todayISO) {
    // Already logged today — no change
    return state;
  }

  // Check if lastLogDate was yesterday
  const last = new Date(lastLogDate + 'T00:00:00');
  const today = new Date(todayISO + 'T00:00:00');
  const diffDays = Math.round((today.getTime() - last.getTime()) / 86_400_000);

  if (diffDays === 1) {
    return { ...state, streak: streak + 1, lastLogDate: todayISO };
  }

  // Gap of 2+ days → reset
  return { ...state, streak: 1, lastLogDate: todayISO };
};

/**
 * Call this on app load to reset completedQuestIds when the calendar day has changed.
 */
export const resetQuestsIfNewDay = (state: GamificationState, todayISO: string): GamificationState => {
  if (state.lastQuestDate === todayISO) return state;
  return { ...state, completedQuestIds: [], lastQuestDate: todayISO };
};
