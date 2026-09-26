import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecipeBuilderModal } from './RecipeBuilderModal';
import { renderWithApp } from '../test/renderWithApp';
import { SavedRecipe, perServingOf } from '../utils/recipes';
import { FoodItem } from '../types';

vi.mock('../services/claudeService', () => ({
  parseFoodLog: vi.fn(),
}));
import { parseFoodLog } from '../services/claudeService';

const ing = (over: Partial<FoodItem>): FoodItem => ({
  id: 'i', name: 'x', calories: 0, protein: 0, carbs: 0, fat: 0, micros: {}, ...over,
});

const batch: FoodItem[] = [
  ing({ id: 'a', name: 'Whey protein 200g', calories: 780, protein: 160, carbs: 12, fat: 12, micros: { Calcium: 500 } }),
  ing({ id: 'b', name: 'Oat flour 150g', calories: 570, protein: 20, carbs: 100, fat: 11, micros: { Iron: 6 } }),
];

const savedBrownies = (): SavedRecipe => ({
  id: 'r1',
  name: 'Protein brownies',
  ingredientsText: '200g whey\n150g oat flour',
  ingredients: batch,
  servings: 12,
  perServing: perServingOf(batch, 12, 'Protein brownies', 'r1-s'),
  createdAt: '2026-09-26',
});

const render = (over: Partial<Parameters<typeof RecipeBuilderModal>[0]> = {}) => {
  const props = {
    recipes: [], onSave: vi.fn(), onDelete: vi.fn(), onLog: vi.fn(), onClose: vi.fn(), ...over,
  };
  return { props, user: userEvent.setup(), ...renderWithApp(<RecipeBuilderModal {...props} />) };
};

afterEach(() => vi.clearAllMocks());

describe('building a recipe', () => {
  it('opens straight into the form when there is nothing saved', () => {
    render();
    expect(screen.getByLabelText(/Recipe name/)).toBeInTheDocument();
  });

  it('will not analyse until there is a name and ingredients', async () => {
    const { user } = render();
    expect(screen.getByRole('button', { name: /Analyse/ })).toBeDisabled();
    await user.type(screen.getByLabelText(/Recipe name/), 'Protein brownies');
    expect(screen.getByRole('button', { name: /Analyse/ })).toBeDisabled();
    await user.type(screen.getByLabelText(/went into the batch/), '200g whey');
    expect(screen.getByRole('button', { name: /Analyse/ })).toBeEnabled();
  });

  it('shows ONE serving, not the whole batch', async () => {
    // The point of the feature: the batch is 1350 kcal, a brownie is 112.5,
    // displayed rounded to 113.
    vi.mocked(parseFoodLog).mockResolvedValue(batch);
    const { user } = render();
    await user.type(screen.getByLabelText(/Recipe name/), 'Protein brownies');
    await user.type(screen.getByLabelText(/went into the batch/), '200g whey\n150g oat flour');
    await user.click(screen.getByRole('button', { name: /Analyse/ }));

    expect(await screen.findByText(/113 kcal/)).toBeInTheDocument();       // round(1350/12)
    expect(screen.getByText(/Whole batch: 1350 kcal/)).toBeInTheDocument();
  });

  it('saves the ingredient text so the recipe can be revisited', async () => {
    vi.mocked(parseFoodLog).mockResolvedValue(batch);
    const onSave = vi.fn();
    const { user } = render({ onSave });
    await user.type(screen.getByLabelText(/Recipe name/), 'Protein brownies');
    await user.type(screen.getByLabelText(/went into the batch/), '200g whey');
    await user.click(screen.getByRole('button', { name: /Analyse/ }));
    await screen.findByText(/Whole batch/);
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));

    const saved = onSave.mock.calls[0][0] as SavedRecipe;
    expect(saved.name).toBe('Protein brownies');
    expect(saved.ingredientsText).toContain('200g whey');
    expect(saved.servings).toBe(12);
    expect(saved.perServing.calories).toBeCloseTo(1350 / 12, 1);
  });

  it('tells the user when nothing was recognised', async () => {
    vi.mocked(parseFoodLog).mockResolvedValue([]);
    const { user } = render();
    await user.type(screen.getByLabelText(/Recipe name/), 'Mystery');
    await user.type(screen.getByLabelText(/went into the batch/), 'asdfgh');
    await user.click(screen.getByRole('button', { name: /Analyse/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/identify any ingredients/i);
  });

  it('distinguishes a failed request from an unrecognised one, and keeps the input', async () => {
    // parseFoodLog throws rather than returning [] precisely so these differ.
    vi.mocked(parseFoodLog).mockRejectedValue(new Error('network'));
    const { user } = render();
    await user.type(screen.getByLabelText(/Recipe name/), 'Brownies');
    await user.type(screen.getByLabelText(/went into the batch/), '200g whey');
    await user.click(screen.getByRole('button', { name: /Analyse/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not reach/i);
    expect((screen.getByLabelText(/went into the batch/) as HTMLTextAreaElement).value).toBe('200g whey');
  });
});

describe('logging a saved recipe', () => {
  it('lists what a serving contains', () => {
    render({ recipes: [savedBrownies()] });
    expect(screen.getByText('Protein brownies')).toBeInTheDocument();
    expect(screen.getByText(/per serving/)).toBeInTheDocument();
    expect(screen.getByText(/batch of 12/)).toBeInTheDocument();
  });

  it('logs one serving by default', async () => {
    const onLog = vi.fn();
    const { user } = render({ recipes: [savedBrownies()], onLog });
    await user.click(screen.getByRole('button', { name: /Log \d+ kcal/ }));
    const [meal, food] = onLog.mock.calls[0];
    expect(meal).toBe('Snack');
    expect(food.calories).toBeCloseTo(1350 / 12, 1);
    expect(food.servingSize).toBe('1 serving');
  });

  it('scales the serving, micros included', async () => {
    // Two brownies must be two brownies' worth of iron, not one.
    const onLog = vi.fn();
    const { user } = render({ recipes: [savedBrownies()], onLog });
    const portions = screen.getByLabelText('Servings');
    await user.clear(portions);
    await user.type(portions, '2');
    await user.click(screen.getByRole('button', { name: /Log \d+ kcal/ }));

    const food = onLog.mock.calls[0][1] as FoodItem;
    expect(food.calories).toBeCloseTo((1350 / 12) * 2, 1);
    expect(food.micros!.Iron).toBeCloseTo((6 / 12) * 2, 2);
    expect(food.servingSize).toBe('2 servings');
  });

  it('carries micronutrients into the log, so the Body tab sees them', async () => {
    const onLog = vi.fn();
    const { user } = render({ recipes: [savedBrownies()], onLog });
    await user.click(screen.getByRole('button', { name: /Log \d+ kcal/ }));
    const food = onLog.mock.calls[0][1] as FoodItem;
    expect(Object.keys(food.micros!)).toEqual(expect.arrayContaining(['Calcium', 'Iron']));
  });

  it('can delete a recipe', async () => {
    const onDelete = vi.fn();
    const { user } = render({ recipes: [savedBrownies()], onDelete });
    await user.click(screen.getByRole('button', { name: /Delete Protein brownies/ }));
    expect(onDelete).toHaveBeenCalledWith('r1');
  });
});
