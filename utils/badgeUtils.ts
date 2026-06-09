import { GamificationState } from '../types';

interface BadgeContext {
  gamification: GamificationState;
  /** Running count of all quests ever completed (passed in from App so we can track lifetime) */
  lifetimeQuestsCompleted: number;
  /** Today's micronutrient score (0-100). Pass 0 if not available. */
  microScore: number;
  /** Today's water consumed in ml. Pass 0 if not tracking. */
  waterMl: number;
}

/**
 * Returns an array of badge IDs that should now be awarded but aren't yet in state.badges.
 * Merge the result back into state.badges in the calling component.
 */
export const checkBadges = (ctx: BadgeContext): string[] => {
  const { gamification, lifetimeQuestsCompleted, microScore, waterMl } = ctx;
  const earned = new Set(gamification.badges);
  const newBadges: string[] = [];

  const award = (id: string) => {
    if (!earned.has(id)) newBadges.push(id);
  };

  // First Steps — completed at least 1 quest ever
  if (lifetimeQuestsCompleted >= 1) award('first-steps');

  // Century — 100 XP
  if (gamification.xp >= 100) award('century');

  // Level 5
  if (gamification.level >= 5) award('level-5');

  // Week Warrior — 7-day streak
  if (gamification.streak >= 7) award('week-warrior');

  // Iron Will — 30-day streak
  if (gamification.streak >= 30) award('iron-will');

  // Quest Master — 25 lifetime quests
  if (lifetimeQuestsCompleted >= 25) award('quest-master');

  // Hydration Hero — 2000 ml in a day
  if (waterMl >= 2000) award('hydration-hero');

  // Nutrition Nerd — micro score >= 70
  if (microScore >= 70) award('nutrition-nerd');

  return newBadges;
};
