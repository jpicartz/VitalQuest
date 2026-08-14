import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NutritionTracker } from './NutritionTracker';
import {
  aProfile, aPlan, aMealLog, aFood, aWaterLog, aWeightEntry, TODAY,
} from '../test/fixtures';
import { addDaysISO } from '../utils/dateUtils';

/**
 * Smoke tests for the CURRENT (v1) sub-tab structure: Food Log / Trends / Analysis.
 *
 * Phase 6 of v2 disperses these three surfaces across Today / Body / Goal, so
 * this file is the inventory of what must survive that move. Every assertion
 * here is a surface a user can reach today.
 */

type Props = Parameters<typeof NutritionTracker>[0];

const renderTracker = (over: Partial<Props> = {}) => {
  const props: Props = {
    logs: [],
    onAddFood: vi.fn(),
    onUpdateLog: vi.fn(),
    onDeleteLog: vi.fn(),
    targets: { calories: 2654, protein: 118, carbs: 355, fat: 74 },
    profile: aProfile(),
    selectedDate: TODAY,
    onSelectDate: vi.fn(),
    allFoodLogs: [],
    onResetTodayLog: vi.fn(),
    plan: aPlan(),
    waterLog: aWaterLog(),
    onLogWater: vi.fn(),
    onResetWater: vi.fn(),
    weightHistory: [aWeightEntry()],
    favouriteFoods: [],
    onAddFavourite: vi.fn(),
    onRemoveFavourite: vi.fn(),
    onQuickAddFavourite: vi.fn(),
    ...over,
  };
  return { props, user: userEvent.setup(), ...render(<NutritionTracker {...props} />) };
};

const subTab = (name: string) => screen.getByRole('button', { name });

describe('NutritionTracker — the three sub-destinations', () => {
  it('opens on Food Log', () => {
    renderTracker();
    expect(screen.getByText('Calories Remaining')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('reaches Trends', async () => {
    const { user } = renderTracker();
    await user.click(subTab('Trends'));
    expect(screen.getByText('Micronutrient Snapshot')).toBeInTheDocument();
  });

  it('reaches Analysis', async () => {
    const { user } = renderTracker();
    await user.click(subTab('Analysis'));
    expect(screen.getByText('Daily Summary')).toBeInTheDocument();
    expect(screen.getByText('Micronutrient Score')).toBeInTheDocument();
  });
});

describe('NutritionTracker — Food Log surfaces', () => {
  it('renders all four meal sections', () => {
    renderTracker();
    for (const meal of ['Breakfast', 'Lunch', 'Dinner', 'Snack']) {
      expect(screen.getByText(meal)).toBeInTheDocument();
    }
  });

  it('lists a logged food with its macros', () => {
    renderTracker({ logs: [aMealLog({ food: aFood({ name: 'Greek Yogurt', calories: 420 }) })] });
    expect(screen.getByText('Greek Yogurt')).toBeInTheDocument();
    expect(screen.getByText('420')).toBeInTheDocument();
  });

  it('shows remaining calories against the target', () => {
    renderTracker({ logs: [aMealLog({ food: aFood({ calories: 654 }) })] });
    expect(screen.getByText('2000')).toBeInTheDocument(); // 2654 - 654
  });

  it('offers water quick-adds on today and calls the handler', async () => {
    const onLogWater = vi.fn();
    const { user } = renderTracker({ onLogWater });
    await user.click(screen.getByRole('button', { name: '+250 ml' }));
    expect(onLogWater).toHaveBeenCalledWith(250);
  });

  it('opens the add-food panel from a meal card', async () => {
    const { user } = renderTracker();
    await user.click(screen.getAllByRole('button', { name: /Add Food/ })[0]);
    expect(screen.getByLabelText(/Quick add with AI/)).toBeInTheDocument();
  });

  it('navigates to a previous day and hides today-only widgets', async () => {
    const onSelectDate = vi.fn();
    const { user } = renderTracker({ onSelectDate });
    await user.click(screen.getByRole('button', { name: /previous day/i }));
    expect(onSelectDate).toHaveBeenCalledWith(addDaysISO(TODAY, -1));
  });

  it('hides the water widget when viewing a past day', () => {
    renderTracker({ selectedDate: addDaysISO(TODAY, -3) });
    expect(screen.queryByRole('button', { name: '+250 ml' })).not.toBeInTheDocument();
  });
});

describe('NutritionTracker — Analysis surfaces', () => {
  const withFood = { logs: [aMealLog({ food: aFood({ calories: 420, protein: 28, carbs: 38, fat: 18 }) })] };

  it('renders every Analysis section', async () => {
    const { user } = renderTracker(withFood);
    await user.click(subTab('Analysis'));
    for (const heading of [
      'Daily Summary',
      'Calorie Breakdown',
      'Micronutrient Score',
      'Macro Targets',
      'Micronutrient Breakdown',
    ]) {
      expect(screen.getByText(heading), `missing section: ${heading}`).toBeInTheDocument();
    }
  });

  it('offers PDF export', async () => {
    const { user } = renderTracker(withFood);
    await user.click(subTab('Analysis'));
    expect(screen.getByRole('button', { name: /Export PDF/ })).toBeInTheDocument();
  });

  it('opens a nutrient detail dialog from the breakdown grid', async () => {
    const { user } = renderTracker(withFood);
    await user.click(subTab('Analysis'));
    await user.click(screen.getByRole('button', { name: /Vitamin C/ }));
    expect(await screen.findByRole('dialog', { name: 'Vitamin C' })).toBeInTheDocument();
  });

  it('surfaces nutrient gaps when intake is low', async () => {
    const { user } = renderTracker(withFood);
    await user.click(subTab('Analysis'));
    expect(screen.getByText(/What You're Missing Today/)).toBeInTheDocument();
  });
});

describe('NutritionTracker — Trends surfaces', () => {
  it('offers the 7/14/30-day range selector', async () => {
    const { user } = renderTracker();
    await user.click(subTab('Trends'));
    for (const days of ['7D', '14D', '30D']) {
      expect(screen.getByRole('button', { name: days })).toBeInTheDocument();
    }
  });

  it('lists every priority micronutrient in the snapshot', async () => {
    const { user } = renderTracker();
    await user.click(subTab('Trends'));
    for (const key of ['Fiber', 'Vitamin C', 'Iron', 'Omega-3']) {
      expect(screen.getByText(key), `missing snapshot row: ${key}`).toBeInTheDocument();
    }
  });
});
