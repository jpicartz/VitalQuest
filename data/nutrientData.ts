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
    unit: "g"
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
    unit: "mg"
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
    dailyValue: "900mcg",
    targetVal: 900,
    unit: "mcg"
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

export const MOCK_COMMON_FOODS: FoodItem[] = [
  { 
    id: '1', name: 'Oatmeal', servingSize: '1 cup cooked', calories: 150, protein: 5, carbs: 27, fat: 3, 
    micros: { "Fiber": 4, "Iron": 1.7, "Magnesium": 60, "Zinc": 1.5, "Phosphorus": 180, "Thiamin": 0.2, "Manganese": 1.3, "Selenium": 12, "Sugar": 1 } 
  },
  { 
    id: '2', name: 'Banana', servingSize: 'Medium', calories: 105, protein: 1, carbs: 27, fat: 0, 
    micros: { "Potassium": 422, "Vitamin C": 10, "Fiber": 3, "Vitamin B6": 0.4, "Manganese": 0.3, "Sugar": 14 } 
  },
  { 
    id: '3', name: 'Chicken Breast', servingSize: '4oz', calories: 165, protein: 31, carbs: 0, fat: 3.6, 
    micros: { "Vitamin B6": 0.5, "Niacin": 14, "Selenium": 30, "Phosphorus": 250, "Choline": 95, "Pantothenic Acid": 1.6, "Copper": 40, "Zinc": 1 } 
  },
  { 
    id: '4', name: 'Salmon', servingSize: '4oz', calories: 200, protein: 23, carbs: 0, fat: 12, 
    micros: { "Omega-3": 1.5, "Vitamin D": 12, "Vitamin B12": 4.5, "Selenium": 40, "Niacin": 8, "Iodine": 30, "Copper": 70 } 
  },
  { 
    id: '5', name: 'Rice', servingSize: '1 cup cooked', calories: 200, protein: 4, carbs: 44, fat: 0.4, 
    micros: { "Iron": 1.9, "Folate": 90, "Thiamin": 0.2, "Manganese": 0.7, "Selenium": 11, "Sugar": 0.1 } 
  },
  { 
    id: '6', name: 'Broccoli', servingSize: '1 cup', calories: 55, protein: 3, carbs: 11, fat: 0.6, 
    micros: { "Vitamin C": 80, "Vitamin K": 220, "Fiber": 5, "Folate": 50, "Potassium": 280, "Sugar": 1.5 } 
  },
  { 
    id: '7', name: 'Almonds', servingSize: '1 oz', calories: 160, protein: 6, carbs: 6, fat: 14, 
    micros: { "Vitamin E": 7, "Magnesium": 75, "Fiber": 3.5, "Manganese": 0.6, "Riboflavin": 0.3, "Phosphorus": 135, "Copper": 290 } 
  },
  { 
    id: '8', name: 'Greek Yogurt', servingSize: '1 cup', calories: 130, protein: 23, carbs: 9, fat: 0, 
    micros: { "Calcium": 250, "Vitamin B12": 1.2, "Iodine": 80, "Phosphorus": 300, "Riboflavin": 0.4, "Sugar": 6 } 
  },
  { 
    id: '9', name: 'Egg', servingSize: 'Large', calories: 70, protein: 6, carbs: 0, fat: 5, 
    micros: { "Vitamin D": 1, "Choline": 147, "Selenium": 15, "Biotin": 10, "Vitamin A": 80, "Vitamin B12": 0.5, "Zinc": 0.6 } 
  },
  { 
    id: '10', name: 'Avocado', servingSize: 'Half', calories: 114, protein: 1, carbs: 6, fat: 10, 
    micros: { "Fiber": 5, "Potassium": 345, "Vitamin K": 14, "Folate": 80, "Vitamin E": 2, "Pantothenic Acid": 1.4, "Copper": 190, "Sugar": 0.2 } 
  },
];