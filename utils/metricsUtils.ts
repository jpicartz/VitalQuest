import { UserProfile, CalculatedMetrics, ActivityLevel, Goal } from '../types';

/**
 * Derive BMR / TDEE / BMI and macro targets from a profile.
 *
 * Pure and dependency-free by design: it lives here rather than in App.tsx so
 * it can be unit-tested without pulling React and the whole component tree
 * into the test module graph.
 *
 * BMR uses Mifflin-St Jeor. Activity is taken from `dailySteps` when the user
 * supplied one (a measured number beats a self-reported bucket), otherwise
 * from `activityLevel`.
 */
/**
 * Split a calorie budget into protein / fat / carb grams.
 *
 * Extracted from calculateMetrics so the goal-adjusted target can reuse the
 * exact same formula instead of growing a second, drifting copy of it.
 *
 * Protein is scaled to bodyweight and does NOT shrink with the calorie budget:
 * in a deficit it is the macro you most want to hold. Fat takes a quarter of
 * the budget; carbs are whatever remains.
 */
export const macrosFor = (
  profile: UserProfile,
  calories: number,
): { protein: number; fat: number; carbs: number } => {
  const protein = Math.round(profile.weightKg * (profile.goal === Goal.MuscleGain ? 2.0 : 1.6));
  const fat = Math.round((calories * 0.25) / 9);
  // Carbs are whatever calories remain. For a heavy user in a deficit, protein
  // and fat can exceed the target on their own — clamp rather than show a
  // negative gram target.
  const carbs = Math.max(0, Math.round((calories - (protein * 4) - (fat * 9)) / 4));
  return { protein, fat, carbs };
};

export const calculateMetrics = (profile: UserProfile): CalculatedMetrics => {
  // Mifflin-St Jeor sex constant. NOTE: this is a string comparison against
  // 'Male', so Gender.PreferNotToSay currently receives the -161 constant.
  const s = profile.gender === 'Male' ? 5 : -161;
  const bmr = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.age) + s;

  let multiplier = 1.2;
  if (profile.dailySteps && profile.dailySteps > 0) {
    if (profile.dailySteps < 5000) multiplier = 1.2;
    else if (profile.dailySteps < 7500) multiplier = 1.375;
    else if (profile.dailySteps < 10000) multiplier = 1.55;
    else if (profile.dailySteps < 15000) multiplier = 1.725;
    else multiplier = 1.9;
  } else {
    switch (profile.activityLevel) {
      case ActivityLevel.Light: multiplier = 1.375; break;
      case ActivityLevel.Moderate: multiplier = 1.55; break;
      case ActivityLevel.VeryActive: multiplier = 1.725; break;
      case ActivityLevel.ExtraActive: multiplier = 1.9; break;
      default: multiplier = 1.2;
    }
  }

  let tdee = bmr * multiplier;
  if (profile.goal === Goal.FatLoss) tdee -= 500;
  if (profile.goal === Goal.MuscleGain) tdee += 300;

  const bmi = profile.weightKg / Math.pow(profile.heightCm / 100, 2);

  return {
    bmi, bmr,
    tdee: Math.round(tdee),
    bmiCategory: bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : 'Overweight',
    // NB: the UNROUNDED tdee, matching the original inline computation.
    macros: macrosFor(profile, tdee),
  };
};
