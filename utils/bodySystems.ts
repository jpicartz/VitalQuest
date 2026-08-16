import { MacroTargets } from '../types';
import { NUTRIENT_INFO } from '../data/nutrientData';

/**
 * Body-system nutrient support.
 *
 * Groups the raw per-nutrient percentages into seven systems people actually
 * think about, because "Vitamin B12: 34%" means nothing to most readers while
 * "Energy support: 62%" is a sentence.
 *
 * IMPORTANT FRAMING: these describe how well today's *intake* supports a
 * system. They are NOT a measurement of the user's hair, skin, or hormones —
 * the app has no way to observe those, and the copy must never imply it does.
 * Labels are deliberately "<System> support", never "<System> grade".
 *
 * Groupings follow the roles already documented in NUTRIENT_INFO (e.g. Biotin
 * "often linked to hair/nail health", Vitamin C "collagen production",
 * Selenium/Iodine → thyroid), so the mapping and the education copy agree.
 */

export type BodySystemId =
  | 'hair-nails' | 'skin' | 'muscle' | 'hormonal' | 'energy' | 'immune' | 'bone';

export interface BodySystemDefinition {
  id: BodySystemId;
  label: string;
  /** One line explaining what intake actually drives this. */
  blurb: string;
  /** Canonical NUTRIENT_INFO keys, plus the macro key 'Protein'. */
  nutrients: string[];
}

export const BODY_SYSTEMS: BodySystemDefinition[] = [
  {
    id: 'hair-nails',
    label: 'Hair & Nails',
    blurb: 'Keratin production leans on protein, biotin, zinc and iron.',
    nutrients: ['Protein', 'Biotin', 'Zinc', 'Iron', 'Vitamin D'],
  },
  {
    id: 'skin',
    label: 'Skin',
    blurb: 'Collagen synthesis and barrier function draw on vitamins C, A and E.',
    nutrients: ['Vitamin C', 'Vitamin A', 'Vitamin E', 'Niacin', 'Omega-3', 'Zinc'],
  },
  {
    id: 'muscle',
    label: 'Muscle',
    blurb: 'Repair and contraction need protein plus the key electrolytes.',
    nutrients: ['Protein', 'Magnesium', 'Potassium', 'Calcium', 'Vitamin D', 'Choline'],
  },
  {
    id: 'hormonal',
    label: 'Hormonal',
    blurb: 'Thyroid and steroid hormone pathways depend on these micronutrients.',
    nutrients: ['Vitamin D', 'Zinc', 'Magnesium', 'Omega-3', 'Selenium', 'Iodine', 'Vitamin B6'],
  },
  {
    id: 'energy',
    label: 'Energy',
    blurb: 'Converting food to usable energy and carrying oxygen in the blood.',
    nutrients: ['Iron', 'Vitamin B12', 'Folate', 'Thiamin', 'Riboflavin', 'Niacin', 'Magnesium'],
  },
  {
    id: 'immune',
    label: 'Immune',
    blurb: 'Immune cell function and antioxidant defence.',
    nutrients: ['Vitamin C', 'Vitamin D', 'Zinc', 'Vitamin A', 'Selenium'],
  },
  {
    id: 'bone',
    label: 'Bone',
    blurb: 'Mineral density and the vitamins that direct calcium into bone.',
    nutrients: ['Calcium', 'Vitamin D', 'Vitamin K', 'Magnesium', 'Phosphorus', 'Manganese'],
  },
];

export interface NutrientContribution {
  nutrient: string;
  /** 0-100, clamped. For ceilings this is "how far under the limit you are". */
  pct: number;
  /** True when this nutrient's target is an upper limit, not a goal. */
  isCeiling: boolean;
}

export interface BodySystemScore {
  id: BodySystemId;
  label: string;
  blurb: string;
  /** 0-100 support score: the mean of its clamped nutrient percentages. */
  score: number;
  /** Every contributing nutrient, weakest first — this drives the drill-in. */
  contributions: NutrientContribution[];
  /** Contributors under 50%, weakest first. The "what to fix" list. */
  gaps: NutrientContribution[];
}

/** Protein has no targetVal in NUTRIENT_INFO — its target is per-user. */
const MACRO_TARGET_KEYS: Record<string, keyof MacroTargets> = {
  Protein: 'protein',
  Carbohydrates: 'carbs',
  Fats: 'fat',
};

/**
 * Percentage of target met for one nutrient, clamped to 0-100.
 *
 * Returns null when no target can be resolved, so the caller can exclude the
 * nutrient from the mean rather than silently scoring it zero.
 */
export const nutrientPct = (
  nutrient: string,
  consumed: Record<string, number>,
  targets: MacroTargets
): NutrientContribution | null => {
  const info = NUTRIENT_INFO[nutrient];
  const macroKey = MACRO_TARGET_KEYS[nutrient];

  // Macros live on MacroTargets (per-user), micros on NUTRIENT_INFO (fixed RDA).
  const target = macroKey ? Number(targets?.[macroKey]) : info?.targetVal;
  if (!target || !Number.isFinite(target) || target <= 0) return null;

  const amount = Number(consumed[nutrient]) || 0;
  const isCeiling = info?.direction === 'ceiling';

  // A ceiling nutrient scores 100 while under the limit and falls off as it is
  // exceeded — the inverse of a goal, where more is better up to the target.
  const raw = isCeiling
    ? (amount <= target ? 1 : Math.max(0, 2 - amount / target))
    : amount / target;

  return {
    nutrient,
    pct: Math.round(Math.max(0, Math.min(raw, 1)) * 100),
    isCeiling,
  };
};

/** Totals for the day's macros. Separate because they do not live in `micros`. */
export interface ConsumedMacros {
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Support scores for all seven systems.
 *
 * `consumedMicros` comes from `computeConsumedMicros` so there is exactly one
 * aggregation path in the app. `consumedMacros` is REQUIRED and separate,
 * because protein is stored on `food.protein` and never reaches the micros map
 * — `MICRO_KEY_MAP` has no alias resolving to it. Reading protein from
 * `consumedMicros` silently yields 0, which permanently drags down every system
 * that includes it (Hair & Nails, Muscle). Making the parameter required means
 * a caller cannot forget it.
 */
export const computeBodySystems = (
  consumedMicros: Record<string, number>,
  targets: MacroTargets,
  consumedMacros: ConsumedMacros
): BodySystemScore[] => {
  const consumed: Record<string, number> = {
    ...consumedMicros,
    Protein: Number(consumedMacros?.protein) || 0,
    Carbohydrates: Number(consumedMacros?.carbs) || 0,
    Fats: Number(consumedMacros?.fat) || 0,
  };

  return BODY_SYSTEMS.map((system) => {
    const contributions = system.nutrients
      .map((n) => nutrientPct(n, consumed, targets))
      .filter((c): c is NutrientContribution => c !== null)
      .sort((a, b) => a.pct - b.pct);

    const score = contributions.length
      ? Math.round(contributions.reduce((sum, c) => sum + c.pct, 0) / contributions.length)
      : 0;

    return {
      id: system.id,
      label: system.label,
      blurb: system.blurb,
      score,
      contributions,
      gaps: contributions.filter((c) => c.pct < 50),
    };
  });
};

/** Plain-language band for a support score. Used for copy, never as a diagnosis. */
export const supportBand = (score: number): 'low' | 'building' | 'solid' | 'strong' => {
  if (score < 35) return 'low';
  if (score < 60) return 'building';
  if (score < 85) return 'solid';
  return 'strong';
};
