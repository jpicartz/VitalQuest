import React, { createContext, useContext, useMemo } from 'react';
import {
  MealLog, MealType, FoodItem, WaterLog, WeightEntry, ExerciseEntry, StoredWeightGoal,
} from '../types';

/** Everything the user has logged. Changes constantly. */
export interface LogsValue {
  /** Logs for the selected day. */
  foodLogs: MealLog[];
  /** Every log ever, for trends. */
  allFoodLogs: MealLog[];
  selectedDate: string;
  waterLog: WaterLog;
  weightHistory: WeightEntry[];
  favouriteFoods: FoodItem[];
  exerciseLogs: ExerciseEntry[];
  weightGoal: StoredWeightGoal | null;
}

/** The writes. Stable identities, so consumers of actions alone never re-render. */
export interface LogActionsValue {
  onAddFood: (meal: MealType, food: FoodItem) => void;
  onUpdateLog: (log: MealLog) => void;
  onDeleteLog: (logId: string) => void;
  onResetTodayLog: () => void;
  onSelectDate: (date: string) => void;
  onLogWater: (ml: number) => void;
  onResetWater: () => void;
  onLogWeight: (kg: number) => void;
  onSetWeightGoal: (goal: StoredWeightGoal | null) => void;
  onAddFavourite: (food: FoodItem) => void;
  onRemoveFavourite: (foodId: string) => void;
  onQuickAddFavourite: (food: FoodItem, mealType: MealType) => void;
  onLogExercise: (type: string, durationMin: number, notes?: string) => void;
  onDeleteExercise: (id: string) => void;
}

const LogsContext = createContext<LogsValue | null>(null);
const LogActionsContext = createContext<LogActionsValue | null>(null);

/**
 * Data and actions are two contexts on purpose.
 *
 * Merged, every component that only needs `onLogWater` would re-render on each
 * keystroke in the food input. Split, the actions value is referentially stable
 * and only genuine data consumers re-render.
 */
export const LogsProvider: React.FC<{
  logs: LogsValue;
  actions: LogActionsValue;
  children: React.ReactNode;
}> = ({ logs, actions, children }) => {
  const logsValue = useMemo(() => logs, [
    logs.foodLogs, logs.allFoodLogs, logs.selectedDate, logs.waterLog,
    logs.weightHistory, logs.favouriteFoods, logs.exerciseLogs, logs.weightGoal,
  ]);
  // Callers pass a memoized `actions`; this guard keeps the value stable even
  // if one of them ever forgets.
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;
  const actionsValue = useMemo<LogActionsValue>(() => {
    const keys = Object.keys(actions) as (keyof LogActionsValue)[];
    return Object.fromEntries(
      keys.map((k) => [k, ((...args: unknown[]) =>
        (actionsRef.current[k] as (...a: unknown[]) => void)(...args))]),
    ) as unknown as LogActionsValue;
  }, []);

  return (
    <LogsContext.Provider value={logsValue}>
      <LogActionsContext.Provider value={actionsValue}>
        {children}
      </LogActionsContext.Provider>
    </LogsContext.Provider>
  );
};

export const useLogs = (): LogsValue => {
  const ctx = useContext(LogsContext);
  if (!ctx) throw new Error('useLogs must be used inside <LogsProvider>');
  return ctx;
};

export const useLogActions = (): LogActionsValue => {
  const ctx = useContext(LogActionsContext);
  if (!ctx) throw new Error('useLogActions must be used inside <LogsProvider>');
  return ctx;
};
