import React, { useEffect, useState } from 'react';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { MealSuggestion, UserProfile } from '../types';
import { generateRecipe, type RecipeData } from '../services/claudeService';
import { IconX } from '@tabler/icons-react';

interface RecipeModalProps {
  meal: MealSuggestion;
  profile: UserProfile;
  onClose: () => void;
  onAddToLog: () => void;
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
        const data = await generateRecipe(meal.name, meal.ingredients, profile);
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
    <Modal
      onClose={onClose}
      labelledBy="recipe-modal-title"
      className="bg-card rounded-modal p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
    >
        <div className="flex justify-between items-start mb-4">
          <h3 id="recipe-modal-title" className="text-2xl font-bold text-fg">{meal.name}</h3>
          <button onClick={onClose} aria-label="Close" className="text-fg-mute hover:text-fg"><IconX size={22} /></button>
        </div>

        {isLoading && <p className="text-fg-soft py-8 text-center">Generating recipe…</p>}
        {error && <p role="alert" className="text-fat py-4">{error}</p>}

        {recipe && (
          <div className="space-y-6">
            <div className="nums flex gap-4 text-sm text-fg-soft">
              {recipe.prepTime && <span>Prep: {recipe.prepTime}</span>}
              {recipe.cookTime && <span>Cook: {recipe.cookTime}</span>}
              {recipe.servings && <span>Servings: {recipe.servings}</span>}
            </div>
            <div>
              <h4 className="font-bold text-fg mb-2">Ingredients</h4>
              <ul className="space-y-1 text-sm text-fg-soft">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i}>• {ing.amount} {ing.item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-fg mb-2">Steps</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-fg-soft">
                {recipe.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
            {recipe.tips && (
              <p className="text-sm bg-nutri/10 p-3 rounded-control text-fg">{recipe.tips}</p>
            )}
            <Button variant="primary" className="w-full" onClick={() => { onAddToLog(); onClose(); }}>
              Add to Food Log
            </Button>
          </div>
        )}
    </Modal>
  );
};
