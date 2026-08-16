import { UserProfile, WellnessPlan, FoodItem, MealSuggestion, MacroTargets, NutritionInsight } from "../types";
import type { InsightsPayload } from "../utils/nutritionAggregates";
import { COACH_SYSTEM_RULES } from "../utils/coachSafety";

// Full-reasoning model for plan generation and weekly insights
const MODEL = 'claude-sonnet-4-5';
// Fast structured-JSON model for food parsing, meal suggestions, recipes (~20× cheaper)
const MODEL_FAST = 'claude-haiku-4-5-20251001';

// In dev: call Anthropic directly (key stays local, never deployed).
// In production: route through /api/claude so the key never touches the browser bundle.
const CLAUDE_URL = import.meta.env.DEV
  ? 'https://api.anthropic.com/v1/messages'
  : '/api/claude';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

/**
 * `userMsg` may be a single string (the common case) or a full turn array for
 * multi-turn conversation. The proxy already accepts `role: 'assistant'`, so
 * multi-turn needs no server change.
 */
const callClaude = async (
  system: string,
  userMsg: string | ChatTurn[],
  maxTokens = 1500,
  model = MODEL
): Promise<string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };

  // Dev-only: attach key + CORS bypass header for direct browser calls
  if (import.meta.env.DEV) {
    headers['x-api-key'] = import.meta.env.VITE_ANTHROPIC_API_KEY || '';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }

  const response = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: Array.isArray(userMsg) ? userMsg : [{ role: 'user', content: userMsg }],
    }),
  });

  // The proxy reports failures as { error: "message" }; Anthropic uses
  // { error: { message } }. Handle both, and never let a non-JSON error page
  // (a function timeout returns HTML) surface as a raw SyntaxError.
  let data: {
    error?: string | { message?: string };
    content?: { text?: string }[];
  };
  try {
    data = await response.json();
  } catch {
    throw new Error(
      response.ok
        ? 'The AI returned an unreadable response. Please try again.'
        : `Request failed (${response.status}). Please try again in a moment.`
    );
  }

  if (!response.ok || data.error) {
    const detail =
      typeof data.error === 'string' ? data.error : data.error?.message;
    throw new Error(detail || `Request failed (${response.status}). Please try again.`);
  }

  const text = data.content?.[0]?.text;
  if (typeof text !== 'string') {
    throw new Error('The AI returned an empty response. Please try again.');
  }
  return text.trim();
};

export const parseJsonResponse = (raw: string) => {
  const clean = raw
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No valid JSON found in response');
    return JSON.parse(match[0]);
  }
};

// Safety contract for every surface that can produce health guidance. The app
// asks users for medications and conditions under a "keep recommendations safe"
// promise, so the model must actually act on them.
const HEALTH_SAFETY_RULES = `You are a cautious, evidence-based wellness assistant. Rules you must follow:
- Food first. Recommend a supplement only when diet alone is unlikely to close a real gap.
- Never exceed established tolerable upper intake levels, and never give therapeutic or megadose amounts.
- If the user reports ANY medication, medical condition, or pregnancy/breastfeeding, treat it as safety-critical: omit anything contraindicated, and populate the "caution" field noting the interaction and to confirm with their clinician first.
- Nutrient-drug interactions to respect include (non-exhaustive): vitamin K with anticoagulants, iron/calcium/magnesium with thyroid medication and some antibiotics, potassium with ACE inhibitors, St John's Wort with most drugs, high-dose vitamin A in pregnancy.
- When in doubt, recommend fewer supplements and defer to a healthcare professional.
- Never diagnose, never claim to treat or cure, and never tell the user to change or stop a prescribed medication.
Return only valid JSON.`;

export const generateWellnessPlan = async (profile: UserProfile): Promise<WellnessPlan> => {
  const conditions = profile.medicationsOrConditions?.trim();
  const prompt = `
Analyze this user profile and generate a personalized wellness plan.
User: ${profile.age}yo ${profile.gender}, ${profile.heightCm}cm, ${profile.weightKg}kg, Goal: ${profile.goal}
Activity level: ${profile.activityLevel}. Typical sleep: ${profile.sleepHours}h/night.
Restrictions: ${profile.dietaryRestrictions.join(', ') || 'None'}
Medications / medical conditions: ${conditions || 'None reported'}
${conditions && !/^none$/i.test(conditions)
    ? 'SAFETY CRITICAL: the user reported the conditions/medications above. Screen every suggestion against them and fill in "caution" wherever relevant.'
    : ''}

Return ONLY valid JSON:
{
  "summary": "2-3 sentence overview",
  "currentStrengths": ["s1", "s2", "s3"],
  "areasForImprovement": ["a1", "a2", "a3"],
  "nutritionFocus": "food-first advice",
  "nutritionGaps": ["gap1", "gap2"],
  "safeSupplements": [],
  "dailyQuests": [{"id":"quest-1","title":"...","description":"...","category":"Nutrition","xpReward":25}],
  "safetyDisclaimer": "..."
}
Generate 5-6 dailyQuests mixing Nutrition, Sleep, Movement, Mindfulness.`;

  try {
    const raw = await callClaude(HEALTH_SAFETY_RULES, prompt, 3000);
    const parsed = parseJsonResponse(raw) as Partial<WellnessPlan>;

    // The UI maps over these arrays unguarded, so a well-formed-but-incomplete
    // response would white-screen the app. Treat a bad shape as a failure.
    const required: (keyof WellnessPlan)[] = [
      'currentStrengths', 'areasForImprovement', 'nutritionGaps',
      'safeSupplements', 'dailyQuests',
    ];
    const shapeOk =
      required.every((k) => Array.isArray(parsed[k])) &&
      (parsed.dailyQuests?.length ?? 0) > 0 &&
      typeof parsed.summary === 'string';
    if (!shapeOk) throw new Error('AI returned an unexpected plan shape');

    return parsed as WellnessPlan;
  } catch (error) {
    console.error('generateWellnessPlan error:', error);
    return {
      isFallback: true,
      summary: "Focus on consistency with nutrition and movement.",
      currentStrengths: ["Commitment to tracking", "Goal clarity", "Health awareness"],
      areasForImprovement: ["Nutrition timing", "Training consistency", "Sleep quality"],
      nutritionFocus: "Prioritize whole foods and hit your protein target daily.",
      nutritionGaps: ["Omega-3", "Vitamin D", "Magnesium"],
      safeSupplements: [],
      dailyQuests: [
        { id: "quest-1", title: "Hit Protein Target", description: "Reach daily protein via whole foods", category: "Nutrition", xpReward: 30 },
        { id: "quest-2", title: "8 Hours Sleep", description: "Get to bed on time tonight", category: "Sleep", xpReward: 25 },
        { id: "quest-3", title: "10,000 Steps", description: "Stay active throughout the day", category: "Movement", xpReward: 20 },
        { id: "quest-4", title: "Drink 2.5L Water", description: "Track water intake today", category: "Nutrition", xpReward: 15 },
        { id: "quest-5", title: "5 Minute Breathing", description: "Reset your nervous system", category: "Mindfulness", xpReward: 15 },
      ],
      safetyDisclaimer: "For informational purposes only. Consult a healthcare professional before major diet or exercise changes.",
    };
  }
};

// Normalize micro keys from Claude's various formats to the canonical Title Case keys
// used by NUTRIENT_INFO / PRIORITY_MICROS throughout the app.
export const MICRO_KEY_MAP: Record<string, string> = {
  // Fiber / Sugar
  'fiber': 'Fiber', 'dietary fiber': 'Fiber', 'dietary_fiber': 'Fiber',
  'sugar': 'Sugar', 'sugars': 'Sugar',
  // Vitamins
  'vitamin a': 'Vitamin A', 'vitamin_a': 'Vitamin A',
  'vitamin c': 'Vitamin C', 'vitamin_c': 'Vitamin C', 'ascorbic acid': 'Vitamin C',
  'vitamin d': 'Vitamin D', 'vitamin_d': 'Vitamin D',
  'vitamin e': 'Vitamin E', 'vitamin_e': 'Vitamin E',
  'vitamin k': 'Vitamin K', 'vitamin_k': 'Vitamin K',
  'thiamin': 'Thiamin', 'thiamine': 'Thiamin', 'vitamin b1': 'Thiamin', 'vitamin_b1': 'Thiamin',
  'riboflavin': 'Riboflavin', 'vitamin b2': 'Riboflavin', 'vitamin_b2': 'Riboflavin',
  'niacin': 'Niacin', 'vitamin b3': 'Niacin', 'vitamin_b3': 'Niacin',
  'vitamin b6': 'Vitamin B6', 'vitamin_b6': 'Vitamin B6',
  'folate': 'Folate', 'folic acid': 'Folate', 'vitamin b9': 'Folate', 'vitamin_b9': 'Folate',
  'vitamin b12': 'Vitamin B12', 'vitamin_b12': 'Vitamin B12', 'cobalamin': 'Vitamin B12',
  'biotin': 'Biotin', 'vitamin b7': 'Biotin', 'vitamin_b7': 'Biotin',
  'pantothenic acid': 'Pantothenic Acid', 'pantothenic_acid': 'Pantothenic Acid', 'vitamin b5': 'Pantothenic Acid', 'vitamin_b5': 'Pantothenic Acid',
  'choline': 'Choline',
  // Minerals
  'calcium': 'Calcium',
  'iron': 'Iron',
  'magnesium': 'Magnesium',
  'phosphorus': 'Phosphorus',
  'potassium': 'Potassium',
  'sodium': 'Sodium',
  'zinc': 'Zinc',
  'copper': 'Copper',
  'manganese': 'Manganese',
  'selenium': 'Selenium',
  'iodine': 'Iodine',
  // Other
  'omega-3': 'Omega-3', 'omega 3': 'Omega-3', 'omega_3': 'Omega-3', 'ala': 'Omega-3',
};

export const normalizeMicros = (raw: Record<string, unknown>): FoodItem['micros'] => {
  const result: FoodItem['micros'] = {};
  for (const [key, val] of Object.entries(raw)) {
    const canonical = MICRO_KEY_MAP[key.toLowerCase()] || key; // fall back to original if unknown
    result[canonical] = Number(val) || 0;
  }
  return result;
};

/** Shape the model returns: nutrition for ONE unit, plus how many units. */
interface ParsedFood {
  name?: unknown;
  unit?: unknown;
  quantity?: unknown;
  perUnit?: {
    calories?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown;
    micros?: Record<string, unknown>;
  };
  // Legacy/fallback: a model that ignores the schema and returns totals directly.
  servingSize?: unknown;
  calories?: unknown; protein?: unknown; carbs?: unknown; fat?: unknown;
  micros?: Record<string, unknown>;
}

/**
 * Turn one parsed food into a totalled FoodItem.
 *
 * The multiplication happens HERE, in code, not in the prompt. Asking the model
 * to scale was unreliable in both directions: left to itself it returned
 * per-100g USDA figures while labelling the serving "5 eggs" (a 2.5x
 * under-count), and instructing it to multiply produced a 4x over-count.
 * Per-unit values are something a nutrition database genuinely knows; the
 * arithmetic is something JavaScript should do.
 */
export const scaleParsedFood = (f: ParsedFood, id: string): FoodItem => {
  const per = f.perUnit;
  const rawQty = Number(f.quantity);
  const quantity = Number.isFinite(rawQty) && rawQty > 0 ? rawQty : 1;

  // If the model returned the legacy totals shape, treat it as quantity 1.
  const source = per ?? f;
  const multiplier = per ? quantity : 1;

  const scale = (v: unknown) => {
    const n = Number(v) || 0;
    // 2dp keeps trace micronutrients meaningful without float noise.
    return Math.round(n * multiplier * 100) / 100;
  };

  const baseMicros = normalizeMicros((source.micros as Record<string, unknown>) || {});
  const micros: FoodItem['micros'] = {};
  for (const [k, v] of Object.entries(baseMicros)) {
    micros[k] = Math.round(v * multiplier * 100) / 100;
  }

  const unitLabel = f.unit ? String(f.unit) : String(f.servingSize || '1 serving');

  return {
    id,
    name: String(f.name ?? 'Food'),
    servingSize: per && quantity !== 1 ? `${quantity} × ${unitLabel}` : unitLabel,
    calories: scale(source.calories),
    protein: scale(source.protein),
    carbs: scale(source.carbs),
    fat: scale(source.fat),
    micros,
  };
};

export const parseFoodLog = async (input: string): Promise<FoodItem[]> => {
  const prompt = `Identify each food in this description and report its nutrition PER SINGLE UNIT, plus how many units the user had. Do NOT multiply — the app does that.

Input: "${input}"

For each food:
- "unit": the natural single unit and its weight, e.g. "1 large egg (50g)", "1 slice (28g)", "100g"
- "quantity": how many of that unit the user described (a number; 1 if unstated)
- "perUnit": nutrition for ONE unit only, from USDA reference data

Return ONLY JSON using EXACTLY these micro key names:
{"foods":[{"name":"...","unit":"...","quantity":1,"perUnit":{"calories":0,"protein":0,"carbs":0,"fat":0,"micros":{"Fiber":0,"Sugar":0,"Vitamin A":0,"Vitamin C":0,"Vitamin D":0,"Vitamin E":0,"Vitamin K":0,"Thiamin":0,"Riboflavin":0,"Niacin":0,"Vitamin B6":0,"Folate":0,"Vitamin B12":0,"Biotin":0,"Pantothenic Acid":0,"Choline":0,"Calcium":0,"Iron":0,"Magnesium":0,"Phosphorus":0,"Potassium":0,"Sodium":0,"Zinc":0,"Copper":0,"Manganese":0,"Selenium":0,"Iodine":0,"Omega-3":0}}}]}
Units: Vitamin A/D/K/Folate/B12/Biotin/Selenium/Iodine in mcg; other vitamins and minerals in mg; Omega-3 in g. Estimate from USDA rather than returning 0 where a reasonable value exists. All numbers, no strings.`;

  // NOTE: this deliberately throws rather than returning [] — the caller needs
  // to distinguish "no food found" from "the request failed" so it can tell the
  // user instead of silently closing the form.
  const raw = await callClaude(
    'Precise nutrition database. Report per-unit values only; never multiply. Return only JSON.',
    prompt,
    2500,
    MODEL_FAST
  );
  const data = parseJsonResponse(raw);
  return (data.foods || []).map((f: ParsedFood, i: number) =>
    scaleParsedFood(f, `claude-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`)
  );
};

export const suggestMeals = async (
  criteria: string,
  profile?: UserProfile,
  targets?: MacroTargets
): Promise<MealSuggestion[]> => {
  const profileContext = profile ? `User: ${profile.goal}, Restrictions: ${profile.dietaryRestrictions.join(', ') || 'None'}.` : '';
  const targetContext = targets ? `Targets: ${targets.calories}kcal, ${targets.protein}g protein.` : '';
  const prompt = `${profileContext} ${targetContext} Suggest 2-3 meals for: "${criteria}"
Return ONLY JSON using EXACTLY these micro key names:
{"suggestions":[{"name":"...","description":"...","ingredients":[],"calories":0,"protein":0,"carbs":0,"fat":0,"rationale":"...","micros":{"Fiber":0,"Sugar":0,"Vitamin A":0,"Vitamin C":0,"Vitamin D":0,"Vitamin E":0,"Vitamin K":0,"Thiamin":0,"Riboflavin":0,"Niacin":0,"Vitamin B6":0,"Folate":0,"Vitamin B12":0,"Biotin":0,"Pantothenic Acid":0,"Choline":0,"Calcium":0,"Iron":0,"Magnesium":0,"Phosphorus":0,"Potassium":0,"Sodium":0,"Zinc":0,"Copper":0,"Manganese":0,"Selenium":0,"Iodine":0,"Omega-3":0}}]}
Use 0 for unknown values. All numbers.`;

  try {
    const raw = await callClaude('Nutrition coach. Strictly respect the stated dietary restrictions. Return only JSON.', prompt, 3000, MODEL_FAST);
    const data = parseJsonResponse(raw);
    return (data.suggestions || []).map((s: Record<string, unknown>) => ({
      name: String(s.name),
      description: String(s.description),
      ingredients: (s.ingredients as string[]) || [],
      calories: Number(s.calories) || 0,
      protein: Number(s.protein) || 0,
      carbs: Number(s.carbs) || 0,
      fat: Number(s.fat) || 0,
      rationale: String(s.rationale || ''),
      micros: normalizeMicros((s.micros as Record<string, unknown>) || {}),
    }));
  } catch (error) {
    console.error('suggestMeals error:', error);
    return [];
  }
};

export interface RecipeData {
  prepTime?: string;
  cookTime?: string;
  servings?: number;
  ingredients: { amount: string; item: string }[];
  steps: string[];
  tips?: string;
}

export const generateRecipe = async (
  mealName: string,
  ingredients: string[],
  profile?: UserProfile
): Promise<RecipeData> => {
  const profileContext = profile ? `Goal: ${profile.goal}. Restrictions: ${profile.dietaryRestrictions.join(', ') || 'None'}.` : '';
  const prompt = `${profileContext} Recipe for "${mealName}". Ingredients: ${ingredients.join(', ')}
Return ONLY JSON: {"prepTime":"...","cookTime":"...","servings":2,"ingredients":[{"amount":"...","item":"..."}],"steps":["..."],"tips":"..."}`;
  const raw = await callClaude('Chef. Respect the stated dietary restrictions. Return only JSON.', prompt, 1500, MODEL_FAST);
  // Parse and normalise here so the modal can never map over a missing array.
  const data = parseJsonResponse(raw) as Partial<RecipeData>;
  return {
    prepTime: data.prepTime,
    cookTime: data.cookTime,
    servings: data.servings,
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    steps: Array.isArray(data.steps) ? data.steps : [],
    tips: data.tips,
  };
};

export const generateNutritionInsights = async (
  weekSummary: InsightsPayload,
  profile: UserProfile,
  plan?: WellnessPlan
): Promise<NutritionInsight> => {
  const planContext = plan ? `Plan focus: ${plan.nutritionFocus}. Gaps: ${plan.nutritionGaps.join(', ')}.` : '';
  const prompt = `Analyze last 7 days nutrition. User: ${profile.goal}. ${planContext}
Data: ${JSON.stringify(weekSummary)}
Return ONLY JSON: {"headline":"...","patterns":["..."],"insights":["..."],"recommendations":["..."],"encouragement":"..."}`;

  try {
    const raw = await callClaude(
      'Supportive nutrition coach. Describe patterns in the logged data only. Do not diagnose, and do not suggest supplements or medication changes. Return only JSON.',
      prompt,
      2000
    );
    const data = parseJsonResponse(raw);
    return {
      headline: data.headline || 'Keep logging consistently.',
      patterns: data.patterns || [],
      insights: data.insights || [],
      recommendations: data.recommendations || [],
      encouragement: data.encouragement,
    };
  } catch (error) {
    console.error('generateNutritionInsights error:', error);
    const avg = weekSummary.avgDailyCalories;
    const target = weekSummary.calorieTarget;
    return {
      headline: `You logged ${weekSummary.daysLogged} days this week.`,
      patterns: [`Average ~${avg} kcal vs ${target} kcal target.`],
      insights: [`Weekly total: ${weekSummary.weeklyTotals.calories} kcal.`],
      recommendations: ['Log every meal for a full week.', 'Prioritize protein at breakfast and lunch.'],
      encouragement: 'Small consistent logs beat perfect sporadic ones.',
    };
  }
};

// ── Coach ──────────────────────────────────────────────────────────────────

export interface CoachTurn { role: 'user' | 'assistant'; content: string }

export interface CoachContext {
  profile: UserProfile;
  /** Body-system scores, already computed. */
  systems: { label: string; score: number; gaps: string[] }[];
  /** What the conversation is anchored to, e.g. "Skin". */
  subject?: string;
  planFocus?: string;
  dailyCalorieTarget?: number;
}

/** Keep well under MAX_SYSTEM_CHARS (4000) once the rules are prepended. */
const MAX_CONTEXT_CHARS = 1200;

/**
 * Assemble the per-user context block. Exported so its size can be asserted in
 * tests — dev bypasses the proxy entirely, so an oversized prompt would 413
 * only in production.
 */
export const buildCoachContext = (ctx: CoachContext): string => {
  const { profile, systems, subject, planFocus, dailyCalorieTarget } = ctx;
  const conditions = profile.medicationsOrConditions?.trim();

  const lines = [
    `User: ${profile.age}yo ${profile.gender}, goal ${profile.goal}.`,
    profile.dietaryRestrictions?.length
      ? `Dietary restrictions: ${profile.dietaryRestrictions.join(', ')}.`
      : '',
    conditions && !/^none$/i.test(conditions)
      ? `SAFETY CRITICAL — reported conditions/medications: ${conditions}. Screen every suggestion against these.`
      : '',
    dailyCalorieTarget ? `Daily calorie target: ${dailyCalorieTarget} kcal.` : '',
    planFocus ? `Plan focus: ${planFocus}` : '',
    systems.length
      ? `Today's nutrient support scores: ${systems
          .map((s) => `${s.label} ${s.score}%${s.gaps.length ? ` (short on ${s.gaps.slice(0, 3).join(', ')})` : ''}`)
          .join('; ')}.`
      : 'No food logged today.',
    subject ? `The user opened this conversation from their ${subject} score, so answer about that unless they ask otherwise.` : '',
  ].filter(Boolean);

  const out = lines.join('\n');
  return out.length > MAX_CONTEXT_CHARS ? `${out.slice(0, MAX_CONTEXT_CHARS)}…` : out;
};

/**
 * Ask the coach.
 *
 * NOTE: unlike suggestMeals and generateNutritionInsights, this deliberately
 * does NOT fall back to canned content on failure. Those return generic text
 * when the API is unreachable, which is fine for a meal idea and unacceptable
 * for a conversational health surface — canned content must never appear to
 * answer a restriction-seeking question. On error this throws and the UI says
 * the coach is unavailable.
 */
export const askCoach = async (
  history: CoachTurn[],
  ctx: CoachContext
): Promise<string> => {
  const system = `${COACH_SYSTEM_RULES}\n\n--- The user's data ---\n${buildCoachContext(ctx)}`;
  // Keep the last few turns only: enough for follow-ups, bounded for cost.
  const turns = history.slice(-8);
  return callClaude(system, turns, 700, MODEL_FAST);
};
