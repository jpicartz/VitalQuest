import React, { createContext, useContext, useMemo } from 'react';
import { UserProfile, CalculatedMetrics, WellnessPlan } from '../types';
import { WeightUnit } from '../utils/units';

export interface ProfileValue {
  profile: UserProfile;
  metrics: CalculatedMetrics;
  plan: WellnessPlan;
  /**
   * Change the display unit for weights. Deliberately narrow rather than a
   * general profile setter: the rest of the profile is set at onboarding and
   * an open mutation path would invite editing weight or height without
   * recomputing the metrics that depend on them.
   */
  setWeightUnit: (unit: WeightUnit) => void;
}

/**
 * NOTE: daily targets deliberately do NOT live here.
 *
 * `targets` used to be a re-shaping of `metrics` — `{ calories: metrics.tdee,
 * ...metrics.macros }` — which meant it could not see the user's weight goal
 * and was frozen at the onboarding weight. Every calorie surface in the app
 * read it, so the goal changed nothing anywhere.
 *
 * Use `useTargets()` from ./useTargets instead. Keeping a second, simpler
 * accessor here would just be a way to get the wrong number by accident.
 */

const ProfileContext = createContext<ProfileValue | null>(null);

/**
 * Who the user is and what the plan says.
 *
 * Separate from logs because it is effectively immutable after onboarding: a
 * single AppContext would re-render every profile consumer on each water click.
 */
export const ProfileProvider: React.FC<{
  profile: UserProfile;
  metrics: CalculatedMetrics;
  plan: WellnessPlan;
  onSetWeightUnit: (unit: WeightUnit) => void;
  children: React.ReactNode;
}> = ({ profile, metrics, plan, onSetWeightUnit, children }) => {
  const value = useMemo<ProfileValue>(() => ({
    profile,
    metrics,
    plan,
    setWeightUnit: onSetWeightUnit,
  }), [profile, metrics, plan, onSetWeightUnit]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export const useProfile = (): ProfileValue => {
  const ctx = useContext(ProfileContext);
  // Throwing beats returning undefined: a missing provider is a wiring bug that
  // would otherwise surface as an unrelated "cannot read property of null".
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
};
