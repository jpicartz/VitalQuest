import { NutrientEducation, FoodItem } from '../types';

export const NUTRIENT_INFO: Record<string, NutrientEducation> = {
  // --- Macros ---
  "Protein": {
    description: "The building block of muscles, enzymes, and hormones. Essential for repair and growth.",
    sources: ["Chicken", "Tofu", "Beans", "Fish", "Greek Yogurt"],
    dailyValue: "Varies (1.6-2.2g/kg)",
    unit: "g"
  },
  "Carbohydrates": {
    description: "The body's primary energy source, especially for the brain and high-intensity exercise.",
    sources: ["Oats", "Rice", "Fruits", "Potatoes", "Vegetables"],
    dailyValue: "45-65% of calories",
    unit: "g"
  },
  "Fats": {
    description: "Crucial for hormone production, nutrient absorption (Vitamins A, D, E, K), and brain health.",
    sources: ["Avocado", "Nuts", "Olive Oil", "Salmon", "Seeds"],
    dailyValue: "20-35% of calories",
    unit: "g"
  },
  "Fiber": {
    description: "Indigestible carbs that support digestion, blood sugar regulation, and satiety.",
    sources: ["Beans", "Whole Grains", "Berries", "Broccoli"],
    dailyValue: "28g",
    targetVal: 28,
    unit: "g"
  },
  "Sugar": {
    description: "Simple carbs. Natural sugars (fruit) come with fiber; added sugars should be minimized.",
    sources: ["Fruit (Natural)", "Candy (Added)", "Soda (Added)"],
    caution: "High intake linked to inflammation and metabolic issues.",
    targetVal: 50,
    unit: "g",
    direction: 'ceiling',
  },

  // --- Vitamins ---
  "Vitamin A": {
    description: "Essential for vision, immune system, and reproduction.",
    sources: ["Carrots", "Sweet Potato", "Spinach", "Liver"],
    caution: "High doses from supplements (Retinol) can be toxic.",
    dailyValue: "900mcg",
    targetVal: 900,
    unit: "mcg"
  },
  "Vitamin C": {
    description: "Powerful antioxidant, supports immune health, wound healing, and collagen production.",
    sources: ["Citrus Fruits", "Bell Peppers", "Strawberries", "Broccoli"],
    dailyValue: "90mg",
    targetVal: 90,
    unit: "mg"
  },
  "Vitamin D": {
    description: "Supports bone health, immune function, and mood. Often called the 'sunshine vitamin'.",
    sources: ["Sunlight", "Fatty Fish", "Fortified Milk", "Egg Yolks"],
    caution: "Can be toxic in very high doses. Testing recommended.",
    dailyValue: "20mcg",
    targetVal: 20,
    unit: "mcg"
  },
  "Vitamin E": {
    description: "An antioxidant that protects cells from damage and supports immune function.",
    sources: ["Almonds", "Sunflower Seeds", "Avocado", "Spinach"],
    dailyValue: "15mg",
    targetVal: 15,
    unit: "mg"
  },
  "Vitamin K": {
    description: "Essential for blood clotting and bone metabolism.",
    sources: ["Kale", "Spinach", "Brussels Sprouts", "Broccoli"],
    dailyValue: "120mcg",
    targetVal: 120,
    unit: "mcg"
  },
  "Thiamin": {
    description: "Also known as Vitamin B1. Helps convert food into energy.",
    sources: ["Pork", "Fish", "Seeds", "Nuts"],
    dailyValue: "1.2mg",
    targetVal: 1.2,
    unit: "mg"
  },
  "Riboflavin": {
    description: "Also known as Vitamin B2. Important for growth and red blood cell production.",
    sources: ["Beef", "Tofu", "Milk", "Mushrooms"],
    dailyValue: "1.3mg",
    targetVal: 1.3,
    unit: "mg"
  },
  "Niacin": {
    description: "Vitamin B3. Helps digestive system, skin, and nerves to function.",
    sources: ["Chicken", "Tuna", "Peanuts", "Avocado"],
    dailyValue: "16mg",
    targetVal: 16,
    unit: "mg"
  },
  "Vitamin B6": {
    description: "Involved in brain development and immune function.",
    sources: ["Chickpeas", "Tuna", "Salmon", "Potatoes"],
    dailyValue: "1.7mg",
    targetVal: 1.7,
    unit: "mg"
  },
  "Folate": {
    description: "Vitamin B9. Crucial for DNA synthesis and cell division. Vital during pregnancy.",
    sources: ["Lentils", "Spinach", "Asparagus", "Broccoli"],
    dailyValue: "400mcg",
    targetVal: 400,
    unit: "mcg"
  },
  "Vitamin B12": {
    description: "Vital for nerve function and DNA production. Critical for vegans/vegetarians to monitor.",
    sources: ["Meat", "Eggs", "Nutritional Yeast", "Fortified Foods"],
    dailyValue: "2.4mcg",
    targetVal: 2.4,
    unit: "mcg"
  },
  "Biotin": {
    description: "Vitamin B7. Helps metabolic processes. Often linked to hair/nail health.",
    sources: ["Eggs", "Almonds", "Cauliflower", "Sweet Potato"],
    dailyValue: "30mcg",
    targetVal: 30,
    unit: "mcg"
  },
  "Pantothenic Acid": {
    description: "Vitamin B5. Essential for fatty acid metabolism.",
    sources: ["Mushrooms", "Avocado", "Chicken", "Sweet Potato"],
    dailyValue: "5mg",
    targetVal: 5,
    unit: "mg"
  },
  "Choline": {
    description: "Important for liver function, brain development, and muscle movement.",
    sources: ["Eggs", "Beef", "Chicken", "Fish"],
    dailyValue: "550mg",
    targetVal: 550,
    unit: "mg"
  },

  // --- Minerals ---
  "Calcium": {
    description: "Building block for bones and teeth; helps muscle function.",
    sources: ["Dairy", "Almonds", "Leafy Greens", "Tofu"],
    dailyValue: "1300mg",
    targetVal: 1300,
    unit: "mg"
  },
  "Iron": {
    description: "Transports oxygen in the blood. Deficiency causes fatigue.",
    sources: ["Red Meat", "Spinach", "Lentils", "Fortified Cereals"],
    caution: "Keep away from children (toxicity). High dose causes constipation.",
    dailyValue: "18mg",
    targetVal: 18,
    unit: "mg"
  },
  "Magnesium": {
    description: "Supports over 300 enzyme reactions, including muscle and nerve function.",
    sources: ["Dark Chocolate", "Avocado", "Nuts", "Legumes"],
    dailyValue: "420mg",
    targetVal: 420,
    unit: "mg"
  },
  "Phosphorus": {
    description: "Works with calcium to build strong bones and teeth.",
    sources: ["Chicken", "Turkey", "Dairy", "Sunflower Seeds"],
    dailyValue: "1250mg",
    targetVal: 1250,
    unit: "mg"
  },
  "Potassium": {
    description: "Electrolyte that helps nerves and muscles function and offsets sodium.",
    sources: ["Bananas", "Potatoes", "Spinach", "Coconut Water"],
    dailyValue: "3400mg",
    targetVal: 3400,
    unit: "mg"
  },
  "Sodium": {
    description: "Electrolyte needed for fluid balance, but excess increases blood pressure.",
    sources: ["Table Salt", "Processed Foods", "Pickles"],
    caution: "Limit intake to maintain heart health.",
    dailyValue: "<2300mg",
    targetVal: 2300,
    unit: "mg",
    direction: 'ceiling',
  },
  "Zinc": {
    description: "Supports immune function and DNA synthesis.",
    sources: ["Oysters", "Beef", "Pumpkin Seeds", "Chickpeas"],
    caution: "Long term high use can deplete Copper.",
    dailyValue: "11mg",
    targetVal: 11,
    unit: "mg"
  },
  "Copper": {
    description: "Helps make red blood cells and keeps nerve cells healthy.",
    sources: ["Liver", "Oysters", "Spirulina", "Dark Chocolate"],
    // 0.9 mg and 900 mcg are the same RDA. Stored in mg because that is the
    // unit the model returns for copper whatever the prompt asks for — USDA
    // tables use mg and the training prior wins. Scoring mg against a 900
    // target read as 0.004% DV, i.e. "you ate no copper", every single day.
    dailyValue: "0.9mg",
    targetVal: 0.9,
    unit: "mg"
  },
  "Manganese": {
    description: "Involved in forming connective tissue, bones, and blood clotting factors.",
    sources: ["Mussels", "Hazelnuts", "Brown Rice", "Chickpeas"],
    dailyValue: "2.3mg",
    targetVal: 2.3,
    unit: "mg"
  },
  "Selenium": {
    description: "Important for reproduction, thyroid gland function, and DNA production.",
    sources: ["Brazil Nuts", "Tuna", "Halibut", "Sardines"],
    dailyValue: "55mcg",
    targetVal: 55,
    unit: "mcg"
  },
  "Iodine": {
    description: "Crucial for making thyroid hormones, which control metabolism.",
    sources: ["Seaweed", "Cod", "Yogurt", "Iodized Salt"],
    dailyValue: "150mcg",
    targetVal: 150,
    unit: "mcg"
  },

  // --- Other ---
  "Omega-3": {
    description: "Essential fatty acids for heart and brain health.",
    sources: ["Salmon", "Walnuts", "Chia Seeds", "Flaxseeds"],
    dailyValue: "1.6g",
    targetVal: 1.6,
    unit: "g"
  }
};

/**
 * The three macro keys that live in NUTRIENT_INFO alongside the micros.
 *
 * They are here so body systems can score protein against a per-user target,
 * but they never appear in a FoodItem's `micros` map — macros are stored on
 * `food.protein` / `.carbs` / `.fat`. Anything iterating "the micronutrients"
 * must exclude them.
 */
export const MACRO_INFO_KEYS = ['Protein', 'Carbohydrates', 'Fats'] as const;

/**
 * Every micronutrient the app tracks, in display order.
 *
 * The single source of the nutrient list. The parse prompt builds its JSON
 * skeleton and its unit declaration from this array rather than restating them,
 * because a hand-written copy drifted: Copper was scored in mcg here while the
 * prompt asked for mg, a 1000x under-report that read as "you ate no copper"
 * every day for as long as it was wrong.
 */
export const MICRO_KEYS = Object.keys(NUTRIENT_INFO).filter(
  (k) => !(MACRO_INFO_KEYS as readonly string[]).includes(k),
);
