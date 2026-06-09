import { UserProfile, WellnessPlan, FoodItem, MealSuggestion, MacroTargets, NutritionInsight } from "../types";
import type { InsightsPayload } from "../utils/nutritionAggregates";

const ANTHROPIC_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-5';

const callClaude = async (system: string, userMsg: string, maxTokens = 1500): Promise<string> => {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content[0].text.trim();
};

const parseJsonResponse = (raw: string) => {
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

export const generateWellnessPlan = async (profile: UserProfile): Promise<WellnessPlan> => {
  const prompt = `
Analyze this user profile and generate a personalized wellness plan.
User: ${profile.age}yo ${profile.gender}, ${profile.weightKg}kg, Goal: ${profile.goal}
Restrictions: ${profile.dietaryRestrictions.join(', ') || 'None'}

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
    const raw = await callClaude('Return only valid JSON.', prompt, 2000);
    return parseJsonResponse(raw) as WellnessPlan;
  } catch (error) {
    console.error('generateWellnessPlan error:', error);
    return {
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
const MICRO_KEY_MAP: Record<string, string> = {
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

const normalizeMicros = (raw: Record<string, unknown>): FoodItem['micros'] => {
  const result: FoodItem['micros'] = {};
  for (const [key, val] of Object.entries(raw)) {
    const canonical = MICRO_KEY_MAP[key.toLowerCase()] || key; // fall back to original if unknown
    result[canonical] = Number(val) || 0;
  }
  return result;
};

export const parseFoodLog = async (input: string): Promise<FoodItem[]> => {
  const prompt = `Parse this food description using USDA values. Input: "${input}"
Return ONLY JSON using EXACTLY these micro key names:
{"foods":[{"name":"...","servingSize":"...","calories":0,"protein":0,"carbs":0,"fat":0,"micros":{"Fiber":0,"Sugar":0,"Vitamin A":0,"Vitamin C":0,"Vitamin D":0,"Vitamin E":0,"Vitamin K":0,"Thiamin":0,"Riboflavin":0,"Niacin":0,"Vitamin B6":0,"Folate":0,"Vitamin B12":0,"Biotin":0,"Pantothenic Acid":0,"Choline":0,"Calcium":0,"Iron":0,"Magnesium":0,"Phosphorus":0,"Potassium":0,"Sodium":0,"Zinc":0,"Copper":0,"Manganese":0,"Selenium":0,"Iodine":0,"Omega-3":0}}]}
Use 0 for unknown values. All numbers, no strings in micros.`;

  try {
    const raw = await callClaude('Precise nutrition database. Return only JSON.', prompt, 1800);
    const data = parseJsonResponse(raw);
    return (data.foods || []).map((f: Record<string, unknown>, i: number) => ({
      id: `claude-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`,
      name: String(f.name),
      servingSize: String(f.servingSize || '1 serving'),
      calories: Number(f.calories) || 0,
      protein: Number(f.protein) || 0,
      carbs: Number(f.carbs) || 0,
      fat: Number(f.fat) || 0,
      micros: normalizeMicros((f.micros as Record<string, unknown>) || {}),
    }));
  } catch (error) {
    console.error('parseFoodLog error:', error);
    return [];
  }
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
    const raw = await callClaude('Nutrition coach. Return only JSON.', prompt, 1800);
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

export const generateRecipe = async (mealName: string, ingredients: string[], profile?: UserProfile): Promise<string> => {
  const profileContext = profile ? `Goal: ${profile.goal}. Restrictions: ${profile.dietaryRestrictions.join(', ') || 'None'}.` : '';
  const prompt = `${profileContext} Recipe for "${mealName}". Ingredients: ${ingredients.join(', ')}
Return ONLY JSON: {"prepTime":"...","cookTime":"...","servings":2,"ingredients":[{"amount":"...","item":"..."}],"steps":["..."],"tips":"..."}`;
  const raw = await callClaude('Chef. Return only JSON.', prompt, 1000);
  return raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
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
    const raw = await callClaude('Supportive nutrition coach. Return only JSON.', prompt, 1200);
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
