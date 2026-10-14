import { MacroTargets, UserProfile, WeightEntry } from '../types';

/**
 * The reactive character.
 *
 * Two independent axes, deliberately separated:
 *
 *  - VITALITY reacts to TODAY. It is how well-nourished the character looks
 *    right now — posture, energy, brightness. It moves within a single day.
 *  - BUILD reacts over WEEKS. It is physique, and it tracks the user's own
 *    logged weight against the goal THEY set, plus how consistently they hit
 *    protein. It does not move because of one day's eating.
 *
 * WHY THEY ARE SEPARATE, and the one rule this module exists to enforce:
 * **nothing here makes the character fatter for eating.** A naive version of
 * this feature maps daily calorie surplus to a wider silhouette, which turns
 * the app into something that visually rewards undereating — in an app that
 * already refuses unsafe weight targets in code (see goalProjection). A
 * low-nutrient day makes the character tired, never fat. Eating more than
 * target never degrades anything.
 *
 * Everything here is pure and deterministic. No AI call decides how a user's
 * body is depicted back to them.
 */

/** Everything the character reads, all of it already computed elsewhere. */
export interface AvatarSignals {
  /** 0-100 micronutrient score for today. */
  microScore: number;
  /** Grams of protein logged today. */
  proteinG: number;
  /** Calories logged today. */
  caloriesKcal: number;
  /** Millilitres of water logged today. */
  waterMl: number;
  /** The day's targets. */
  targets: MacroTargets;
  /** Water goal in ml for this user. */
  waterGoalMl: number;
  /** Number of distinct days logged recently — drives build, not vitality. */
  daysLoggedInRange: number;
  /** Days in that range where protein hit at least 90% of target. */
  proteinDaysOnTarget: number;
}

export type VitalityBand = 'depleted' | 'resting' | 'steady' | 'energised' | 'radiant';

export interface VitalityState {
  band: VitalityBand;
  /** 0-100, the blended score behind the band. */
  score: number;
  /** The single biggest thing dragging it down, for the one-line nudge. */
  weakest: { label: string; pct: number } | null;
  /** Component percentages, so the UI can show its working. */
  parts: { label: string; pct: number }[];
}

/** Clamp to 0..100 and round. Guards NaN from any upstream string value. */
const pct = (value: number, target: number): number => {
  const t = Number(target);
  if (!t || !Number.isFinite(t) || t <= 0) return 0;
  const raw = (Number(value) || 0) / t;
  return Math.round(Math.max(0, Math.min(raw, 1)) * 100);
};

/**
 * How the character looks today.
 *
 * Blends four things a user can actually act on before bed. Calories are
 * deliberately scored as "did you eat enough to function", capped at target —
 * going over does not reduce vitality, because punishing a surplus is the
 * mechanic this module refuses to build.
 */
export const computeVitality = (s: AvatarSignals): VitalityState => {
  const parts = [
    { label: 'Nutrients', pct: Math.max(0, Math.min(100, Math.round(Number(s.microScore) || 0))) },
    { label: 'Protein', pct: pct(s.proteinG, s.targets?.protein) },
    { label: 'Fuel', pct: pct(s.caloriesKcal, s.targets?.calories) },
    { label: 'Water', pct: pct(s.waterMl, s.waterGoalMl) },
  ];

  // Nutrients weigh double: this is a micronutrient app, and hitting calories
  // on junk should not light the character up.
  const weighted = parts[0].pct * 2 + parts[1].pct + parts[2].pct + parts[3].pct;
  const score = Math.round(weighted / 5);

  const sorted = [...parts].sort((a, b) => a.pct - b.pct);
  const weakest = sorted[0] && sorted[0].pct < 100 ? sorted[0] : null;

  return { band: vitalityBand(score), score, weakest, parts };
};

export const vitalityBand = (score: number): VitalityBand => {
  if (score < 20) return 'depleted';
  if (score < 45) return 'resting';
  if (score < 70) return 'steady';
  if (score < 90) return 'energised';
  return 'radiant';
};

/** Copy for each band. Describes the CHARACTER, never the user's body. */
export const VITALITY_COPY: Record<VitalityBand, { title: string; line: string }> = {
  depleted: { title: 'Running on empty', line: 'Nothing logged yet today — give them something to work with.' },
  resting:  { title: 'Low energy',       line: 'Fed, but thin on nutrients. A vegetable would go a long way.' },
  steady:   { title: 'Holding steady',   line: 'Solid day so far. A couple of gaps left to close.' },
  energised:{ title: 'Energised',        line: 'Well fed and well nourished. Nearly a perfect day.' },
  radiant:  { title: 'Thriving',         line: 'Everything hit. This is what a complete day looks like.' },
};

export type BuildTone = 'soft' | 'lean' | 'toned' | 'strong';

export interface BuildState {
  tone: BuildTone;
  /** 0-100 progress toward the user's OWN stated goal, or 50 with no goal. */
  goalProgress: number;
  /** Share of recent logged days where protein hit target. */
  proteinConsistency: number;
  caption: string;
}

/**
 * Physique, over weeks.
 *
 * Driven by protein consistency and the user's own weight trend toward the goal
 * they set — never by a single day, and never by a calorie surplus. With no
 * goal set, weight contributes nothing and tone comes from protein alone, so
 * the character still has somewhere to go without the app inventing a target
 * body for someone who never asked for one.
 */
export const computeBuild = (
  s: AvatarSignals,
  profile: UserProfile,
  weightHistory: WeightEntry[] = [],
  goalWeightKg?: number | null,
): BuildState => {
  const proteinConsistency = s.daysLoggedInRange > 0
    ? Math.round((s.proteinDaysOnTarget / s.daysLoggedInRange) * 100)
    : 0;

  const sorted = [...(weightHistory ?? [])]
    .filter((w) => Number.isFinite(Number(w?.kg)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const start = sorted.length ? Number(sorted[0].kg) : Number(profile?.weightKg) || 0;
  const current = sorted.length ? Number(sorted[sorted.length - 1].kg) : Number(profile?.weightKg) || 0;

  let goalProgress = 50;
  const goal = Number(goalWeightKg);
  if (goal && Number.isFinite(goal) && start && Math.abs(goal - start) > 0.01) {
    const moved = (start - current) / (start - goal);
    goalProgress = Math.round(Math.max(0, Math.min(moved, 1)) * 100);
  }

  // Protein leads, because it is the input the user controls daily and the one
  // that actually preserves muscle. Weight progress only lifts an already
  // protein-consistent character — it cannot carry tone on its own.
  const blended = goal ? Math.round(proteinConsistency * 0.65 + goalProgress * 0.35) : proteinConsistency;
  const tone: BuildTone =
    blended >= 80 ? 'strong' : blended >= 55 ? 'toned' : blended >= 30 ? 'lean' : 'soft';

  const caption =
    s.daysLoggedInRange === 0
      ? 'Log a few days and your character starts to change.'
      : tone === 'strong' ? 'Protein held consistently. It shows.'
      : tone === 'toned' ? 'Building. Keep protein up on the days you miss it.'
      : tone === 'lean' ? 'Early days. Protein is the lever here.'
      : 'Protein is falling short most days.';

  return { tone, goalProgress, proteinConsistency, caption };
};

export interface AvatarAchievement {
  id: string;
  label: string;
  xp: number;
  /** Reads only today's signals, so it can be re-evaluated on every change. */
  met: (s: AvatarSignals, v: VitalityState) => boolean;
}

/**
 * What earns XP now that the quest checklist is gone.
 *
 * These replace the AI-generated daily quests, which were the app's main XP
 * source: remove that list without a replacement and anyone who only logs food
 * stops levelling, and the `first-steps` and `quest-master` badges become
 * permanently unreachable.
 *
 * The ids are stored in `gamification.completedQuestIds`, which already resets
 * daily via resetQuestsIfNewDay — so "once per day" needs no new persistence
 * and no schema change.
 */
export const AVATAR_ACHIEVEMENTS: AvatarAchievement[] = [
  {
    id: 'avatar-fed',
    label: 'Logged a real day of food',
    xp: 10,
    met: (s) => pct(s.caloriesKcal, s.targets?.calories) >= 50,
  },
  {
    id: 'avatar-protein',
    label: 'Hit your protein target',
    xp: 30,
    met: (s) => pct(s.proteinG, s.targets?.protein) >= 90,
  },
  {
    id: 'avatar-hydrated',
    label: 'Hit your water goal',
    xp: 15,
    met: (s) => pct(s.waterMl, s.waterGoalMl) >= 100,
  },
  {
    id: 'avatar-nourished',
    label: 'Micronutrient score above 70',
    xp: 25,
    met: (s) => (Number(s.microScore) || 0) >= 70,
  },
  {
    id: 'avatar-radiant',
    label: 'Reached peak vitality',
    xp: 40,
    met: (_s, v) => v.band === 'radiant',
  },
];

/** Achievements met today that have not been credited yet. */
export const pendingAchievements = (
  s: AvatarSignals,
  v: VitalityState,
  alreadyAwardedIds: string[],
): AvatarAchievement[] => {
  const done = new Set(alreadyAwardedIds ?? []);
  return AVATAR_ACHIEVEMENTS.filter((a) => !done.has(a.id) && a.met(s, v));
};
