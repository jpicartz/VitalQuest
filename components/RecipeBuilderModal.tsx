import React, { useState } from 'react';
import { FoodItem, MealType } from '../types';
import { SavedRecipe, perServingOf, scaleServings, sumIngredients } from '../utils/recipes';
import { parseFoodLog } from '../services/claudeService';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import {
  IconX, IconTrash, IconPlus, IconChefHat, IconAlertTriangle,
} from '@tabler/icons-react';

interface RecipeBuilderModalProps {
  recipes: SavedRecipe[];
  onSave: (recipe: SavedRecipe) => void;
  onDelete: (id: string) => void;
  /** Logs a scaled serving into the day. */
  onLog: (meal: MealType, food: FoodItem) => void;
  onClose: () => void;
}

const MEALS: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'] as MealType[];

/**
 * Custom recipes: bake once, log a slice.
 *
 * The user lists what went into the whole batch and says how many servings it
 * makes. The model is asked only what each ingredient contains — the same
 * question `parseFoodLog` already answers for a normal food entry, which is why
 * a recipe gets the full 28 micronutrients rather than a macro-only estimate.
 *
 * Summing the batch and dividing by servings happens in `utils/recipes.ts`, in
 * code. Asking the model to divide would repeat a mistake this app has already
 * made once, and the error would land on every future log of the recipe rather
 * than on a single entry.
 */
export const RecipeBuilderModal: React.FC<RecipeBuilderModalProps> = ({
  recipes, onSave, onDelete, onLog, onClose,
}) => {
  const [mode, setMode] = useState<'list' | 'new'>(recipes.length ? 'list' : 'new');
  const [name, setName] = useState('');
  const [ingredientsText, setIngredientsText] = useState('');
  const [servings, setServings] = useState('12');
  const [parsed, setParsed] = useState<FoodItem[] | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servingCount = Math.max(1, Math.round(Number(servings) || 1));
  const canAnalyse = name.trim().length > 0 && ingredientsText.trim().length > 0;

  const analyse = async () => {
    setIsParsing(true);
    setError(null);
    setParsed(null);
    try {
      const items = await parseFoodLog(ingredientsText);
      if (!items.length) {
        setError("Couldn't identify any ingredients. Try listing them one per line, with amounts.");
        return;
      }
      setParsed(items);
    } catch {
      // parseFoodLog throws rather than returning [] precisely so this case can
      // be told apart from "nothing recognised".
      setError('Could not reach the nutrition service. Your ingredients are still here — try again.');
    } finally {
      setIsParsing(false);
    }
  };

  const save = () => {
    if (!parsed) return;
    const id = `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    onSave({
      id,
      name: name.trim(),
      ingredientsText,
      ingredients: parsed,
      servings: servingCount,
      perServing: perServingOf(parsed, servingCount, name.trim(), `${id}-serving`),
      createdAt: new Date().toISOString(),
    });
    setMode('list');
    setName(''); setIngredientsText(''); setServings('12'); setParsed(null);
  };

  const preview = parsed ? perServingOf(parsed, servingCount, name.trim() || 'Recipe', 'preview') : null;
  const batch = parsed ? sumIngredients(parsed) : null;

  return (
    <Modal
      onClose={onClose}
      labelledBy="recipe-modal-title"
      className="bg-card rounded-modal p-6 max-w-2xl w-full shadow-e3 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex justify-between items-start gap-3 mb-5">
        <h3 id="recipe-modal-title" className="font-display inline-flex items-center gap-2 text-2xl font-bold text-fg">
          <IconChefHat size={22} className="text-accent" /> My Recipes
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-fg-mute hover:text-fg p-1 rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <IconX size={20} />
        </button>
      </div>

      {mode === 'list' ? (
        <div className="space-y-3">
          {recipes.length === 0 ? (
            <p className="text-sm text-fg-soft">No recipes yet.</p>
          ) : (
            recipes.map((r) => (
              <RecipeRow key={r.id} recipe={r} onLog={onLog} onDelete={onDelete} />
            ))
          )}
          <Button variant="primary" fullWidth onClick={() => setMode('new')} className="inline-flex items-center justify-center gap-2">
            <IconPlus size={16} /> New recipe
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field
            label="Recipe name"
            placeholder="e.g. Protein brownies"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <div>
            <label htmlFor="recipe-ingredients" className="block text-xs font-semibold uppercase tracking-wider text-fg-soft mb-1.5">
              Everything that went into the batch
            </label>
            <p className="text-xs text-fg-mute mb-1.5">
              One ingredient per line, with amounts. Include the whole batch — not one serving.
            </p>
            <textarea
              id="recipe-ingredients"
              rows={6}
              value={ingredientsText}
              onChange={(e) => setIngredientsText(e.target.value)}
              placeholder={'200g whey protein powder\n150g oat flour\n50g cocoa powder\n4 eggs\n120ml milk'}
              className="w-full p-3 bg-card border-2 border-edge rounded-control text-fg placeholder:text-fg-mute
                focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent
                focus-visible:ring-offset-2 focus-visible:ring-offset-card transition-colors"
            />
          </div>

          <Field
            label="Servings the batch makes"
            hint="How many pieces or portions you cut it into."
            type="number"
            min={1}
            step={1}
            emphasis
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />

          {error && (
            <div role="alert" className="flex gap-2.5 items-start bg-fat/10 border border-fat/30 rounded-tile p-3">
              <IconAlertTriangle size={16} className="text-fat shrink-0 mt-0.5" />
              <p className="text-sm text-fg">{error}</p>
            </div>
          )}

          {preview && batch && (
            <div className="bg-raised border border-edge rounded-tile p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-fg-mute">
                One serving · batch of {servingCount}
              </p>
              <div className="nums flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span className="font-bold text-fg">{Math.round(preview.calories)} kcal</span>
                <span className="text-protein">P {preview.protein}g</span>
                <span className="text-carbs">C {preview.carbs}g</span>
                <span className="text-fat">F {preview.fat}g</span>
              </div>
              <p className="nums text-xs text-fg-mute">
                Whole batch: {Math.round(batch.calories)} kcal · {parsed!.length} ingredients recognised ·{' '}
                {Object.keys(preview.micros ?? {}).length} micronutrients tracked
              </p>
              <details className="text-xs">
                <summary className="cursor-pointer text-fg-soft font-semibold">What was recognised</summary>
                <ul className="mt-2 space-y-1 text-fg-mute">
                  {parsed!.map((i) => (
                    <li key={i.id} className="nums">
                      {i.name} — {Math.round(i.calories)} kcal
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={analyse}
              disabled={!canAnalyse}
              loading={isParsing}
              loadingLabel="Working it out…"
            >
              {parsed ? 'Re-analyse' : 'Analyse ingredients'}
            </Button>
            <Button variant="primary" onClick={save} disabled={!parsed}>
              Save recipe
            </Button>
            {recipes.length > 0 && (
              <Button variant="ghost" onClick={() => { setMode('list'); setError(null); }}>Cancel</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

/** One saved recipe, with the controls to log a portion of it. */
const RecipeRow: React.FC<{
  recipe: SavedRecipe;
  onLog: (meal: MealType, food: FoodItem) => void;
  onDelete: (id: string) => void;
}> = ({ recipe, onLog, onDelete }) => {
  const [portions, setPortions] = useState('1');
  const [meal, setMeal] = useState<MealType>('Snack' as MealType);
  const n = Number(portions) || 1;
  const scaled = scaleServings(recipe.perServing, n, `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

  return (
    <div className="bg-raised border border-edge rounded-tile p-4">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <p className="font-bold text-fg">{recipe.name}</p>
          <p className="nums text-xs text-fg-mute mt-0.5">
            {Math.round(recipe.perServing.calories)} kcal · P {recipe.perServing.protein}g ·
            C {recipe.perServing.carbs}g · F {recipe.perServing.fat}g{' '}
            <span className="text-fg-soft">per serving</span> · batch of {recipe.servings}
          </p>
        </div>
        <button
          onClick={() => onDelete(recipe.id)}
          aria-label={`Delete ${recipe.name}`}
          className="text-fg-mute hover:text-fat p-1 rounded-control shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fat"
        >
          <IconTrash size={16} />
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 mt-3">
        <div className="w-20">
          <label htmlFor={`p-${recipe.id}`} className="block text-[10px] font-semibold uppercase tracking-wider text-fg-soft mb-1">
            Servings
          </label>
          <input
            id={`p-${recipe.id}`}
            type="number" min={0.25} step={0.25} inputMode="decimal"
            value={portions}
            onChange={(e) => setPortions(e.target.value)}
            className="nums w-full p-2 bg-card border-2 border-edge rounded-control text-fg text-sm
              focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
        <div className="flex-1 min-w-[7rem]">
          <label htmlFor={`m-${recipe.id}`} className="block text-[10px] font-semibold uppercase tracking-wider text-fg-soft mb-1">
            Meal
          </label>
          <select
            id={`m-${recipe.id}`}
            value={meal}
            onChange={(e) => setMeal(e.target.value as MealType)}
            className="w-full p-2 bg-card border-2 border-edge rounded-control text-fg text-sm
              focus:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {MEALS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <Button
          variant="outline"
          className="text-sm px-4 py-2"
          onClick={() => onLog(meal, scaled)}
        >
          Log {Math.round(scaled.calories)} kcal
        </Button>
      </div>
    </div>
  );
};
