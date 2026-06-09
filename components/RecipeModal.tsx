import React, { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { MealSuggestion, UserProfile } from '../types';
import { generateRecipe } from '../services/claudeService';

interface RecipeModalProps {
  meal: MealSuggestion;
  profile: UserProfile;
  onClose: () => void;
  onAddToLog: () => void;
}

interface RecipeData {
  prepTime?: string;
  cookTime?: string;
  servings?: number;
  ingredients: { amount: string; item: string }[];
  steps: string[];
  tips?: string;
}

export const RecipeModal: React.FC<RecipeModalProps> = ({ meal, profile, onClose, onAddToLog }) => {
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const raw = await generateRecipe(meal.name, meal.ingredients, profile);
        const data = JSON.parse(raw) as RecipeData;
        if (!cancelled) setRecipe(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load recipe');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [meal, profile]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-2xl font-black text-green-800">{meal.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl font-bold">×</button>
        </div>

        {isLoading && <p className="text-slate-500 py-8 text-center">Generating recipe…</p>}
        {error && <p className="text-red-600 py-4">{error}</p>}

        {recipe && (
          <div className="space-y-6">
            <div className="flex gap-4 text-sm text-slate-500">
              {recipe.prepTime && <span>Prep: {recipe.prepTime}</span>}
              {recipe.cookTime && <span>Cook: {recipe.cookTime}</span>}
              {recipe.servings && <span>Servings: {recipe.servings}</span>}
            </div>
            <div>
              <h4 className="font-bold text-slate-800 mb-2">Ingredients</h4>
              <ul className="space-y-1 text-sm text-slate-600">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>• {ing.amount} {ing.item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-800 mb-2">Steps</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
                {recipe.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
            {recipe.tips && (
              <p className="text-sm bg-green-50 p-3 rounded-xl text-green-800 border border-green-100">{recipe.tips}</p>
            )}
            <Button variant="primary" className="w-full" onClick={() => { onAddToLog(); onClose(); }}>
              Add to Food Log
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
