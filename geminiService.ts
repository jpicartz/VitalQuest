
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, WellnessPlan, FoodItem, MealSuggestion, MacroTargets } from "../types";

// Helper for exponential backoff to handle rate limits (429)
const retryWithBackoff = async <T>(operation: () => Promise<T>, retries = 3, delay = 1000): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || 
                        error?.code === 429 || 
                        error?.message?.includes('429') || 
                        error?.status === 'RESOURCE_EXHAUSTED';
    
    if (retries > 0 && isRateLimit) {
      console.warn(`Rate limit hit. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(operation, retries - 1, delay * 2);
    }
    throw error;
  }
};

const wellnessPlanSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    currentStrengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    areasForImprovement: { type: Type.ARRAY, items: { type: Type.STRING } },
    nutritionFocus: { type: Type.STRING },
    nutritionGaps: { type: Type.ARRAY, items: { type: Type.STRING } },
    safeSupplements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          reason: { type: Type.STRING },
          caution: { type: Type.STRING },
          priority: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
        },
        required: ["name", "reason", "caution", "priority"],
      },
    },
    dailyQuests: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          category: { type: Type.STRING, enum: ["Nutrition", "Sleep", "Movement", "Mindfulness"] },
          xpReward: { type: Type.INTEGER },
        },
        required: ["id", "title", "description", "category", "xpReward"],
      },
    },
    safetyDisclaimer: { type: Type.STRING },
  },
  required: ["summary", "currentStrengths", "areasForImprovement", "nutritionFocus", "nutritionGaps", "safeSupplements", "dailyQuests", "safetyDisclaimer"],
};

export const generateWellnessPlan = async (profile: UserProfile): Promise<WellnessPlan> => {
  const prompt = `
    You are VitalQuest, an evidence-based wellness assistant. 
    Analyze this user profile and generate a JSON wellness plan.

    User Profile:
    - Age: ${profile.age}
    - Gender: ${profile.gender}
    - Goal: ${profile.goal}
    - Restrictions: ${profile.dietaryRestrictions.join(', ')}
    - Medical/Meds: ${profile.medicationsOrConditions || 'None'}

    SAFETY RULES:
    1. Food-first approach. 
    2. Only suggest safe, evidence-based supplements.
  `;

  try {
    const response = await retryWithBackoff(async () => {
      // Create a new instance right before the call as per guidelines
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      return await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: wellnessPlanSchema,
        },
      });
    });
    // Use .text property directly
    return JSON.parse(response.text || '{}') as WellnessPlan;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      summary: "Error generating plan. Please try again.",
      currentStrengths: ["Commitment"],
      areasForImprovement: ["Consistency"],
      nutritionFocus: "Focus on whole foods.",
      nutritionGaps: [],
      safeSupplements: [],
      dailyQuests: [],
      safetyDisclaimer: "Consult a professional."
    };
  }
};

const foodParseSchema = {
  type: Type.OBJECT,
  properties: {
    foods: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          servingSize: { type: Type.STRING },
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          micros: { 
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                amount: { type: Type.NUMBER }
              },
              required: ["name", "amount"]
            }
          }
        },
        required: ["name", "servingSize", "calories", "protein", "carbs", "fat", "micros"],
      }
    }
  }
};

const NUTRIENT_ALIASES: Record<string, string> = {
  "Vitamin B2": "Riboflavin",
  "Vitamin B7": "Biotin",
  "Vitamin B1": "Thiamin",
  "Dietary Fiber": "Fiber",
  "Total Fiber": "Fiber",
  "Total Sugars": "Sugar",
  "Vit B12": "Vitamin B12",
  "Vitamin B-12": "Vitamin B12",
  "Vitamin B-6": "Vitamin B6",
  "Omega 3": "Omega-3"
};

export const parseFoodLog = async (input: string): Promise<FoodItem[]> => {
  const prompt = `
    Analyze this food log and return JSON nutrition data.
    Input: "${input}"
    
    CRITICAL MICRONUTRIENTS TO TRACK:
    Fiber, Sugar, Omega-3, Calcium, Iron, Magnesium, Zinc, Copper, Sodium, Potassium, Phosphorus, Manganese, Selenium, Iodine, Vitamins A, C, D, E, K, Thiamin, Riboflavin, Niacin, Pantothenic Acid, Vitamin B6, Biotin, Folate, Vitamin B12, Choline.

    DO NOT TRACK Chromium or Molybdenum.
  `;

  try {
     const response = await retryWithBackoff(async () => {
       const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
       return await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: foodParseSchema,
        },
      });
     });
    
    const text = response.text;
    if(!text) return [];
    
    const data = JSON.parse(text);
    return data.foods.map((f: any, i: number) => {
      const microsMap: Record<string, number> = {};
      if (Array.isArray(f.micros)) {
        f.micros.forEach((m: {name: string, amount: number}) => {
          const normalizedName = NUTRIENT_ALIASES[m.name] || m.name;
          microsMap[normalizedName] = Number(m.amount);
        });
      }
      return {
        id: `ai-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`,
        name: f.name,
        servingSize: f.servingSize || "1 serving",
        calories: Number(f.calories),
        protein: Number(f.protein),
        carbs: Number(f.carbs),
        fat: Number(f.fat),
        micros: microsMap
      };
    });
  } catch (error) {
    console.error("Error parsing food", error);
    return [];
  }
}

const mealSuggestionSchema = {
  type: Type.OBJECT,
  properties: {
    suggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          rationale: { type: Type.STRING },
          micros: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                amount: { type: Type.NUMBER }
              },
              required: ["name", "amount"]
            }
          }
        },
        required: ["name", "description", "ingredients", "calories", "protein", "carbs", "fat", "rationale", "micros"]
      }
    }
  },
  required: ["suggestions"]
};

export const suggestMeals = async (criteria: string, profile?: UserProfile, targets?: MacroTargets): Promise<MealSuggestion[]> => {
  const profileContext = profile ? `User Profile: ${profile.age}yo ${profile.gender}, Goal: ${profile.goal}. ` : '';
  const targetContext = targets ? `Daily Targets: ${targets.calories}kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat. ` : '';
  const prompt = `${profileContext}${targetContext}Suggest 2-3 healthy meals based on: "${criteria}". Include realistic macros and key micronutrients. Ensure the suggestions align with the user's goals and daily targets.`;
  try {
    const response = await retryWithBackoff(async () => {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      return await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: mealSuggestionSchema,
        },
      });
    });
    const data = JSON.parse(response.text || '{"suggestions": []}');
    return (data.suggestions || []).map((s: any) => ({
      ...s,
      micros: Array.isArray(s.micros)
        ? Object.fromEntries(s.micros.map((m: any) => [m.name, Number(m.amount)]))
        : {}
    }));
  } catch (error) {
    console.error("suggestMeals error:", error);
    return [];
  }
};
