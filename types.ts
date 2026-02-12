export enum Gender {
  Male = 'Male',
  Female = 'Female',
  PreferNotToSay = 'PreferNotToSay'
}

export enum ActivityLevel {
  Sedentary = 'Sedentary (office job, little exercise)',
  Light = 'Lightly Active (1-3 days/week)',
  Moderate = 'Moderately Active (3-5 days/week)',
  VeryActive = 'Very Active (6-7 days/week)',
  ExtraActive = 'Extra Active (physical job or training)'
}

export enum Goal {
  FatLoss = 'Fat Loss',
  MuscleGain = 'Muscle Gain',
  Endurance = 'Endurance / Performance',
  GeneralHealth = 'General Health & Maintenance'
}

export enum DietaryRestriction {
  Vegan = 'Vegan',
  Vegetarian = 'Vegetarian',
  GlutenFree = 'Gluten-Free',
  LactoseFree = 'Lactose-Free',
  Kosher = 'Kosher',
  Halal = 'Halal',
  None = 'None'
}

export interface UserProfile {
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  dailySteps?: number;
  goal: Goal;
  dietaryRestrictions: DietaryRestriction[];
  medicationsOrConditions: string;
  sleepHours: number;
}

// Calculated locally
export interface CalculatedMetrics {
  bmi: number;
  bmr: number;
  tdee: number;
  bmiCategory: string;
  macros: {
    protein: number;
    fat: number;
    carbs: number;
  }
}

// Targets for the tracker
export interface MacroTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// AI Generated Response Structure
export interface SupplementRecommendation {
  name: string;
  reason: string;
  caution: string; // Safety note
  priority: 'High' | 'Medium' | 'Low';
}

export interface Habit {
  id: string;
  title: string;
  description: string;
  category: 'Nutrition' | 'Sleep' | 'Movement' | 'Mindfulness';
  xpReward: number;
}

export interface WellnessPlan {
  summary: string;
  currentStrengths: string[]; // What the user is doing well
  areasForImprovement: string[]; // What needs work
  nutritionFocus: string; // Food-first advice
  nutritionGaps: string[];
  safeSupplements: SupplementRecommendation[];
  dailyQuests: Habit[];
  safetyDisclaimer: string; // AI generated context-specific disclaimer
}

export interface GamificationState {
  xp: number;
  level: number;
  streak: number;
  completedQuestIds: string[]; // Resets daily in a real app
  badges: string[];
}

// --- New Types for Food Logging & Nutrition ---

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

export interface Micronutrients {
  [key: string]: number; // e.g., "Vitamin C": 40 (mg implied or handled in display)
}

export interface FoodItem {
  id: string;
  name: string;
  servingSize?: string; // e.g., "100g", "1 cup", "4oz"
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micros?: Micronutrients;
}

export interface MealLog {
  id: string;
  type: MealType;
  food: FoodItem;
  timestamp: number;
}

export interface DailyLog {
  date: string; // ISO date string YYYY-MM-DD
  meals: MealLog[];
}

export interface NutrientEducation {
  description: string;
  sources: string[];
  caution?: string;
  dailyValue?: string; // Text representation e.g. "90mg"
  targetVal?: number;  // Numeric value for percentage calc
  unit?: string;       // Unit string e.g. "mg", "mcg"
}

export interface MealSuggestion {
  name: string;
  description: string;
  ingredients: string[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  micros: Micronutrients;
  rationale: string;
}