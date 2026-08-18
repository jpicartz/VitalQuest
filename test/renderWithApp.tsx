import React from 'react';
import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { ProfileProvider } from '../contexts/ProfileContext';
import { LogsProvider, LogsValue, LogActionsValue } from '../contexts/LogsContext';
import { UserProfile, CalculatedMetrics, WellnessPlan } from '../types';
import { aProfile, aMetrics, aPlan, aWaterLog, TODAY } from './fixtures';

/**
 * Renders a component inside the real providers.
 *
 * Deliberately takes ONE flat object, the same shape the components used to
 * take as props. The context extraction changed the plumbing, not what the
 * tests assert — and the tests are the only evidence that it changed nothing
 * the user can see, so their bodies had to stay still while the wiring moved.
 */
export interface AppOverrides extends Partial<LogsValue>, Partial<LogActionsValue> {
  profile?: UserProfile;
  metrics?: CalculatedMetrics;
  plan?: WellnessPlan;
}

export const buildContexts = (over: AppOverrides = {}) => {
  const logs: LogsValue = {
    foodLogs: over.foodLogs ?? [],
    allFoodLogs: over.allFoodLogs ?? [],
    selectedDate: over.selectedDate ?? TODAY,
    waterLog: over.waterLog ?? aWaterLog(),
    weightHistory: over.weightHistory ?? [],
    favouriteFoods: over.favouriteFoods ?? [],
    exerciseLogs: over.exerciseLogs ?? [],
    weightGoal: over.weightGoal ?? null,
  };
  const actions: LogActionsValue = {
    onAddFood: over.onAddFood ?? vi.fn(),
    onUpdateLog: over.onUpdateLog ?? vi.fn(),
    onDeleteLog: over.onDeleteLog ?? vi.fn(),
    onResetTodayLog: over.onResetTodayLog ?? vi.fn(),
    onSelectDate: over.onSelectDate ?? vi.fn(),
    onLogWater: over.onLogWater ?? vi.fn(),
    onResetWater: over.onResetWater ?? vi.fn(),
    onLogWeight: over.onLogWeight ?? vi.fn(),
    onSetWeightGoal: over.onSetWeightGoal ?? vi.fn(),
    onAddFavourite: over.onAddFavourite ?? vi.fn(),
    onRemoveFavourite: over.onRemoveFavourite ?? vi.fn(),
    onQuickAddFavourite: over.onQuickAddFavourite ?? vi.fn(),
    onLogExercise: over.onLogExercise ?? vi.fn(),
    onDeleteExercise: over.onDeleteExercise ?? vi.fn(),
  };
  return {
    logs,
    actions,
    profile: over.profile ?? aProfile(),
    metrics: over.metrics ?? aMetrics(),
    plan: over.plan ?? aPlan(),
  };
};

export const renderWithApp = (ui: React.ReactElement, over: AppOverrides = {}) => {
  const { logs, actions, profile, metrics, plan } = buildContexts(over);
  const result = render(
    <ProfileProvider profile={profile} metrics={metrics} plan={plan}>
      <LogsProvider logs={logs} actions={actions}>{ui}</LogsProvider>
    </ProfileProvider>,
  );
  return { ...result, logs, actions, profile, metrics, plan };
};
