import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NutritionTracker } from './NutritionTracker';
import { aMealLog, aFood, aWeightEntry, TODAY } from '../test/fixtures';
import { renderWithApp, AppOverrides } from '../test/renderWithApp';
import { addDaysISO } from '../utils/dateUtils';
import { MICRO_KEYS, NUTRIENT_INFO } from '../data/nutrientData';

/**
 * Smoke tests for the CURRENT (v1) sub-tab structure: Food Log / Trends / Analysis.
 *
 * Phase 6 of v2 disperses these three surfaces across Today / Body / Goal, so
 * this file is the inventory of what must survive that move. Every assertion
 * here is a surface a user can reach today.
 */

const renderTracker = (over: AppOverrides & { view?: 'log' | 'trends' | 'analysis' } = {}) => {
  const { view, ...ctx } = over;
  return {
    user: userEvent.setup(),
    ...renderWithApp(<NutritionTracker view={view} />, {
      weightHistory: [aWeightEntry()],
      ...ctx,
    }),
  };
};

// The sub-destinations are a real tablist now, and the range picker a real
// radiogroup -- both were plain buttons with no keyboard contract before.
const subTab = (name: string) => screen.getByRole('tab', { name });
const range = (name: string) => screen.getByRole('radio', { name });

describe('NutritionTracker — the three sub-destinations', () => {
  it('opens on Food Log', () => {
    renderTracker();
    expect(screen.getByText('Calories Remaining')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });

  it('reaches Trends', async () => {
    const { user } = renderTracker();
    await user.click(subTab('Trends'));
    expect(range('Last 7 days')).toBeInTheDocument();
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
    renderTracker({ foodLogs: [aMealLog({ food: aFood({ name: 'Greek Yogurt', calories: 420 }) })] });
    expect(screen.getByText('Greek Yogurt')).toBeInTheDocument();
    expect(screen.getByText('420')).toBeInTheDocument();
  });

  it('shows remaining calories against the target', () => {
    renderTracker({ foodLogs: [aMealLog({ food: aFood({ calories: 654 }) })] });
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
  const withFood = { foodLogs: [aMealLog({ food: aFood({ calories: 420, protein: 28, carbs: 38, fat: 18 }) })] };

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

describe('NutritionTracker — never renders NaN', () => {
  // The AI returns "28g" instead of 28 often enough that this is a real input.
  // The component used to run its own micro aggregation with `Number(x || 0)`,
  // so the breakdown tiles rendered "NaN% DV" directly beneath a correct score.
  // Asserting on the util alone does not catch that — it has to be the render.
  // NB: these must be UNPARSEABLE. '420' coerces to 420 and proves nothing —
  // it has to be a value like '420 kcal' that Number() genuinely rejects.
  const stringyMicros = {
    foodLogs: [aMealLog({
      food: aFood({
        calories: '420 kcal' as never,
        protein: '28 g' as never,
        micros: { Fiber: '28g', 'Vitamin C': '90mg', Iron: 8 } as never,
      }),
    })],
  };

  it('shows no NaN in the Analysis tab given string-valued nutrients', async () => {
    const { user, container } = renderTracker(stringyMicros);
    await user.click(subTab('Analysis'));
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it('shows no NaN in the Trends snapshot given string-valued nutrients', async () => {
    const { user, container } = renderTracker(stringyMicros);
    await user.click(subTab('Trends'));
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it('shows no NaN in the Food Log given string-valued macros', () => {
    const { container } = renderTracker(stringyMicros);
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it('still counts the parseable nutrient alongside the unparseable one', async () => {
    const { user } = renderTracker(stringyMicros);
    await user.click(subTab('Analysis'));
    // Iron: 8 is valid and must survive; Fiber's "28g" must not poison it.
    expect(screen.getByRole('button', { name: /Iron/ })).toBeInTheDocument();
  });
});

describe('NutritionTracker — Trends surfaces', () => {
  it('offers the 7/14/30-day range selector', async () => {
    const { user } = renderTracker();
    await user.click(subTab('Trends'));
    for (const days of [7, 14, 30]) {
      expect(range(`Last ${days} days`)).toBeInTheDocument();
    }
  });

  // The snapshot answers "how am I doing today?", not "how has the week gone?",
  // so it sits with the rest of today's nutrient detail in Analysis, not Trends.
  it('lists every priority micronutrient in the snapshot', async () => {
    const { user } = renderTracker();
    await user.click(subTab('Analysis'));
    // Scope to the snapshot: Fiber also appears as a Macro Targets bar, and
    // every one of these appears again in the 26-tile breakdown below.
    const snapshot = within(
      screen.getByText('Micronutrient Snapshot').closest('section') as HTMLElement,
    );
    for (const key of ['Fiber', 'Vitamin C', 'Iron', 'Omega-3']) {
      expect(snapshot.getByText(key), `missing snapshot row: ${key}`).toBeInTheDocument();
    }
  });
});

describe('a ceiling nutrient is never presented as a goal', () => {
  /** A day well over both ceilings and short on everything else. */
  const saltyDay: AppOverrides = {
    foodLogs: [aMealLog({
      food: aFood({
        name: 'Instant ramen and a soda',
        calories: 700, protein: 12, carbs: 110, fat: 20,
        micros: { Sodium: 3450, Sugar: 75, Potassium: 200 },
      }),
    })],
  };

  it('labels sodium as a share of its limit, not as % DV', () => {
    renderWithApp(<NutritionTracker view="analysis" />, saltyDay);
    const tile = screen.getByTitle('Sodium').closest('button')!;
    // 3450 of 2300 = 150%. The number is right either way; the words are what
    // told the user whether that is good or bad.
    expect(within(tile).getByText(/150% of limit/)).toBeInTheDocument();
    expect(within(tile).queryByText(/150% DV/)).not.toBeInTheDocument();
  });

  it('shows sugar at all — it is tracked, so it must be visible', () => {
    renderWithApp(<NutritionTracker view="analysis" />, saltyDay);
    const tile = screen.getByTitle('Sugar').closest('button')!;
    expect(within(tile).getByText(/150% of limit/)).toBeInTheDocument();
  });

  it('still reads % DV for an ordinary goal nutrient', () => {
    renderWithApp(<NutritionTracker view="analysis" />, saltyDay);
    const tile = screen.getByTitle('Potassium').closest('button')!;
    expect(within(tile).getByText(/6% DV/)).toBeInTheDocument();
  });

  it('calls the ceiling a limit in the detail sheet, and does not suggest eating it', async () => {
    const user = userEvent.setup();
    renderWithApp(<NutritionTracker view="analysis" />, saltyDay);
    await user.click(screen.getByTitle('Sodium').closest('button')!);

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Daily Limit')).toBeInTheDocument();
    expect(within(sheet).queryByText('Daily Target')).not.toBeInTheDocument();
    // "Suggested Food Sources: Table Salt, Processed Foods, Pickles" was the
    // app recommending salt in order to reach a limit.
    expect(within(sheet).queryByText('Suggested Food Sources')).not.toBeInTheDocument();
    expect(within(sheet).getByText('Common Sources')).toBeInTheDocument();
    // The honest data was always there; it must still be shown.
    expect(within(sheet).getByText(/<2300mg/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Limit intake/)).toBeInTheDocument();
  });

  it('keeps suggesting sources for a nutrient you should get more of', async () => {
    const user = userEvent.setup();
    renderWithApp(<NutritionTracker view="analysis" />, saltyDay);
    await user.click(screen.getByTitle('Iron').closest('button')!);

    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Daily Target')).toBeInTheDocument();
    expect(within(sheet).getByText('Suggested Food Sources')).toBeInTheDocument();
  });

  it('gives every tracked nutrient a stated daily value in the sheet', () => {
    // Sugar had no dailyValue, so its sheet showed an empty target.
    for (const k of MICRO_KEYS) {
      expect(NUTRIENT_INFO[k].dailyValue, `${k} has no dailyValue`).toBeTruthy();
    }
  });
});
