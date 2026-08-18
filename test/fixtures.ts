import {
  UserProfile, CalculatedMetrics, WellnessPlan, GamificationState,
  MealLog, FoodItem, WaterLog, WeightEntry, ExerciseEntry,
  Gender, ActivityLevel, Goal, MealType,
} from '../types';
import { toISODateString, timestampForISODate } from '../utils/dateUtils';

/**
 * Shared fixtures for component tests. Every builder takes an overrides object
 * so a test can state only the field it cares about.
 */

export const TODAY = toISODateString();

export const aProfile = (over: Partial<UserProfile> = {}): UserProfile => ({
  age: 29,
  gender: Gender.Male,
  heightCm: 178,
  weightKg: 74,
  activityLevel: ActivityLevel.Moderate,
  goal: Goal.GeneralHealth,
  dietaryRestrictions: [],
  medicationsOrConditions: 'None',
  sleepHours: 7,
  ...over,
});

export const aMetrics = (over: Partial<CalculatedMetrics> = {}): CalculatedMetrics => ({
  bmi: 23.4,
  bmr: 1712,
  tdee: 2654,
  bmiCategory: 'Normal',
  macros: { protein: 118, fat: 74, carbs: 355 },
  ...over,
});

export const aPlan = (over: Partial<WellnessPlan> = {}): WellnessPlan => ({
  summary: 'A balanced plan focused on whole foods and steady movement.',
  currentStrengths: ['Consistent movement', 'Good hydration'],
  areasForImprovement: ['More protein at breakfast'],
  nutritionFocus: 'Build meals around protein and vegetables.',
  nutritionGaps: ['Vitamin D', 'Omega-3'],
  safeSupplements: [],
  dailyQuests: [
    { id: 'quest-1', title: 'Hit Protein Target', description: 'Reach your protein goal', category: 'Nutrition', xpReward: 30 },
    { id: 'quest-2', title: 'Eight Hours Sleep', description: 'Lights out on time', category: 'Sleep', xpReward: 25 },
  ],
  safetyDisclaimer: 'General wellness information only.',
  ...over,
});

export const aGamification = (over: Partial<GamificationState> = {}): GamificationState => ({
  xp: 120,
  level: 2,
  streak: 5,
  completedQuestIds: [],
  badges: [],
  lastQuestDate: TODAY,
  lastLogDate: TODAY,
  ...over,
});

export const aFood = (over: Partial<FoodItem> = {}): FoodItem => ({
  id: 'food-1',
  name: 'Greek Yogurt',
  servingSize: '1 bowl',
  calories: 420,
  protein: 28,
  carbs: 38,
  fat: 18,
  micros: { Fiber: 7, 'Vitamin C': 22, Calcium: 320 },
  ...over,
});

export const aMealLog = (over: Partial<MealLog> = {}, dateISO = TODAY): MealLog => ({
  id: `log-${Math.random().toString(36).slice(2)}`,
  type: 'Breakfast' as MealType,
  food: aFood(),
  timestamp: timestampForISODate(dateISO),
  ...over,
});

export const aWaterLog = (over: Partial<WaterLog> = {}): WaterLog => ({
  date: TODAY,
  mlConsumed: 1500,
  ...over,
});

export const aWeightEntry = (over: Partial<WeightEntry> = {}): WeightEntry => ({
  date: TODAY,
  kg: 74,
  ...over,
});

export const anExercise = (over: Partial<ExerciseEntry> = {}): ExerciseEntry => ({
  id: 'ex-1',
  date: TODAY,
  type: 'Running',
  durationMin: 30,
  xpEarned: 10,
  ...over,
});
