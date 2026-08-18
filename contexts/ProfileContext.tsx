import React, { createContext, useContext, useMemo } from 'react';
import { UserProfile, CalculatedMetrics, WellnessPlan, MacroTargets } from '../types';

export interface ProfileValue {
  profile: UserProfile;
  metrics: CalculatedMetrics;
  plan: WellnessPlan;
  /** Derived from metrics, in one place. Was recomputed inline at 3 call sites. */
  targets: MacroTargets;
}

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
  children: React.ReactNode;
}> = ({ profile, metrics, plan, children }) => {
  const value = useMemo<ProfileValue>(() => ({
    profile,
    metrics,
    plan,
    targets: { calories: metrics.tdee, ...metrics.macros },
  }), [profile, metrics, plan]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

export const useProfile = (): ProfileValue => {
  const ctx = useContext(ProfileContext);
  // Throwing beats returning undefined: a missing provider is a wiring bug that
  // would otherwise surface as an unrelated "cannot read property of null".
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
};
