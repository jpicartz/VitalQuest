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
  const proteinGrams = Math.round(profile.weightKg * (profile.goal === Goal.MuscleGain ? 2.0 : 1.6));
  const fatGrams = Math.round((tdee * 0.25) / 9);
  // Carbs are whatever calories remain. For a heavy user in a deficit, protein
  // and fat can exceed the target on their own — clamp rather than show a
  // negative gram target.
  const carbGrams = Math.max(0, Math.round((tdee - (proteinGrams * 4) - (fatGrams * 9)) / 4));

  return {
    bmi, bmr,
    tdee: Math.round(tdee),
    bmiCategory: bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : 'Overweight',
    macros: { protein: proteinGrams, fat: fatGrams, carbs: carbGrams },
  };
};
