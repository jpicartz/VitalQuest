import { FoodItem, Micronutrients } from '../types';

/**
 * Custom recipes: a batch of ingredients divided into servings.
 *
 * The arithmetic lives here, in code, and never in a prompt. The model is only
 * ever asked what a single ingredient contains — `parseFoodLog` already does
 * that and already returns per-unit values scaled by quantity in JS. Summing
 * the batch and dividing by servings is ordinary arithmetic, and this codebase
 * has already paid once for asking a model to multiply: told to scale "5 eggs"
 * it overshot by 4x. Division by servings is the same trap with a worse
 * failure mode, because the error lands on every future log of that recipe.
 */

export interface SavedRecipe {
  id: string;
  name: string;
  /** Exactly what the user typed, so the recipe can be edited and re-parsed. */
  ingredientsText: string;
  /** Parsed ingredients, kept so the user can see what the numbers came from. */
  ingredients: FoodItem[];
  /** How many servings the whole batch makes. Always >= 1. */
  servings: number;
  /** One serving: the batch total divided by `servings`. Computed here. */
  perServing: FoodItem;
  createdAt: string;
}

/** Round to 2dp — keeps trace micronutrients meaningful without float noise. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Coerce defensively: the model occasionally returns "28g" instead of 28. */
const num = (v: unknown): number => Number(v) || 0;

/**
 * Add up every ingredient in the batch.
 *
 * Micros are summed by key. Keys are already canonical because
 * `scaleParsedFood` runs `normalizeMicros` on the way in, so a recipe cannot
 * introduce a spelling the rest of the app does not recognise.
 */
export const sumIngredients = (items: FoodItem[]): Omit<FoodItem, 'id' | 'name'> => {
  const micros: Micronutrients = {};
  let calories = 0, protein = 0, carbs = 0, fat = 0;

  for (const item of items) {
    calories += num(item.calories);
    protein += num(item.protein);
    carbs += num(item.carbs);
    fat += num(item.fat);
    if (item.micros) {
      for (const [key, value] of Object.entries(item.micros)) {
        micros[key] = r2((micros[key] || 0) + num(value));
      }
    }
  }

  return {
    calories: r2(calories),
    protein: r2(protein),
    carbs: r2(carbs),
    fat: r2(fat),
    micros,
  };
};

/**
 * Divide a batch into one serving.
 *
 * `servings` is clamped to at least 1: a zero would produce Infinity and a
 * negative would produce nonsense, and either would silently poison every
 * total this serving is later added to.
 */
export const perServingOf = (
  items: FoodItem[],
  servings: number,
  name: string,
  id: string,
): FoodItem => {
  const total = sumIngredients(items);
  const n = Number.isFinite(servings) && servings >= 1 ? servings : 1;

  const micros: Micronutrients = {};
  for (const [key, value] of Object.entries(total.micros ?? {})) {
    micros[key] = r2(value / n);
  }

  return {
    id,
    name,
    servingSize: '1 serving',
    calories: r2(total.calories / n),
    protein: r2(total.protein / n),
    carbs: r2(total.carbs / n),
    fat: r2(total.fat / n),
    micros,
  };
};

/**
 * Multiply one serving by however many the user actually ate.
 *
 * Separate from `perServingOf` so logging two brownies is a scale of the stored
 * serving, never a re-division of the batch — re-deriving it each time would
 * compound the rounding.
 */
export const scaleServings = (perServing: FoodItem, servings: number, id: string): FoodItem => {
  const n = Number.isFinite(servings) && servings > 0 ? servings : 1;
  const micros: Micronutrients = {};
  for (const [key, value] of Object.entries(perServing.micros ?? {})) {
    micros[key] = r2(num(value) * n);
  }
  return {
    ...perServing,
    id,
    servingSize: n === 1 ? '1 serving' : `${n} servings`,
    calories: r2(num(perServing.calories) * n),
    protein: r2(num(perServing.protein) * n),
    carbs: r2(num(perServing.carbs) * n),
    fat: r2(num(perServing.fat) * n),
    micros,
  };
};
