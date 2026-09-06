/**
 * Weight units.
 *
 * ONE canonical unit: kilograms. Everything stored, projected and compared is
 * kg — `weightKg`, `targetKg`, every `WeightEntry`, the BMI floor, the
 * kcal-per-kg constant. Pounds exist only at the two edges: parsing what
 * someone typed, and formatting what they read.
 *
 * Storing the user's display unit alongside the value, or storing lbs at all,
 * would put a conversion in front of every safety comparison in
 * goalProjection. The BMI floor is not a rendering concern.
 */

export type WeightUnit = 'kg' | 'lbs';

/** Pounds in a kilogram. Was inline in Onboarding; now it has one home. */
export const LBS_PER_KG = 2.20462;

export const kgToLbs = (kg: number): number => kg * LBS_PER_KG;
export const lbsToKg = (lbs: number): number => lbs / LBS_PER_KG;

/** A stored kg value in the unit the user reads, rounded for display. */
export const toDisplayWeight = (kg: number, unit: WeightUnit): number => {
  const value = unit === 'lbs' ? kgToLbs(kg) : kg;
  return Math.round(value * 10) / 10;
};

/** A number the user typed, back to canonical kg. */
export const fromDisplayWeight = (value: number, unit: WeightUnit): number =>
  unit === 'lbs' ? lbsToKg(value) : value;

/** "74.2 kg" / "163.6 lbs" — the value with its unit, for copy and labels. */
export const formatWeight = (kg: number, unit: WeightUnit): string =>
  `${toDisplayWeight(kg, unit)} ${unit}`;

/**
 * A *difference* between two weights. Separate from formatWeight because a
 * delta must never be converted by adding an offset — only by scaling — and
 * because callers reading "to go" want the sign handled for them.
 */
export const formatWeightDelta = (deltaKg: number, unit: WeightUnit): string =>
  `${toDisplayWeight(Math.abs(deltaKg), unit)} ${unit}`;

/** Sensible input step: 0.1 kg is ~0.2 lbs, so both are fine at one decimal. */
export const WEIGHT_STEP = 0.1;

/**
 * Plausibility bounds for a typed weight, in the unit being typed. The kg
 * bounds are the app's existing 20–400; the lbs equivalents are derived rather
 * than hand-written so they cannot drift apart.
 */
export const weightBounds = (unit: WeightUnit) => ({
  min: Math.round(toDisplayWeight(20, unit)),
  max: Math.round(toDisplayWeight(400, unit)),
});
