import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import {
  aProfile, aMetrics, aPlan, aGamification, aMealLog, aFood,
  aWaterLog, aWeightEntry, anExercise, TODAY,
} from '../test/fixtures';

/**
 * Smoke tests for the v2 information architecture: four destinations —
 * Today / Body / Goal / Coach — plus a profile sheet.
 *
 * Rewritten from the v1 version as part of the restructure. Each assertion here
 * corresponds to a row in docs/v2-surface-inventory.md; a surface that silently
 * stops being reachable produces no error and no visual glitch, so this file is
 * what catches it.
 */

type Props = Parameters<typeof Dashboard>[0];

const renderDashboard = (over: Partial<Props> = {}) => {
  const props: Props = {
    profile: aProfile(),
    metrics: aMetrics(),
    plan: aPlan(),
    gamification: aGamification(),
    onUpdateGamification: vi.fn(),
    onReset: vi.fn(),
    foodLogs: [],
    onAddFood: vi.fn(),
    onUpdateLog: vi.fn(),
    onDeleteLog: vi.fn(),
    onResetTodayLog: vi.fn(),
    selectedDate: TODAY,
    onSelectDate: vi.fn(),
    allFoodLogs: [],
    waterLog: aWaterLog(),
    onLogWater: vi.fn(),
    onResetWater: vi.fn(),
    weightHistory: [aWeightEntry({ kg: 76, isBaseline: true })],
    onLogWeight: vi.fn(),
    weightGoal: null,
    onSetWeightGoal: vi.fn(),
    favouriteFoods: [],
    onAddFavourite: vi.fn(),
    onRemoveFavourite: vi.fn(),
    onQuickAddFavourite: vi.fn(),
    exerciseLogs: [],
    onLogExercise: vi.fn(),
    onDeleteExercise: vi.fn(),
    ...over,
  };
  return { props, user: userEvent.setup(), ...render(<Dashboard {...props} />) };
};

const tab = (name: RegExp) => screen.getByRole('tab', { name });

const sectionFor = (heading: string) => {
  const el = screen.getByText(heading).closest('section');
  if (!el) throw new Error(`No <section> wrapping heading "${heading}"`);
  return within(el);
};

describe('Dashboard — always-visible header', () => {
  it('shows level, XP, streak and calories', () => {
    renderDashboard({ gamification: aGamification({ xp: 120, level: 2, streak: 5 }) });
    expect(screen.getByText('Level')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('day streak')).toBeInTheDocument();
    expect(screen.getByText('kcal eaten')).toBeInTheDocument();
  });

  it('sums calories from the logs it is given', () => {
    renderDashboard({
      foodLogs: [
        aMealLog({ food: aFood({ calories: 400 }) }),
        aMealLog({ food: aFood({ calories: 350 }) }),
      ],
    });
    expect(screen.getByText('750')).toBeInTheDocument();
  });

  it('renders earned badges', () => {
    renderDashboard({ gamification: aGamification({ badges: ['century'] }) });
    expect(screen.getByText('Century')).toBeInTheDocument();
  });
});

// ── The four destinations ─────────────────────────────────────────────────
describe('Dashboard — v2 navigation', () => {
  it('exposes exactly four tabs', () => {
    renderDashboard();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, '').trim()))
      .toEqual(['Today', 'Body', 'Goal', 'Coach']);
  });

  it('opens on Today — logging is the daily job', () => {
    renderDashboard();
    expect(tab(/Today/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Calories Remaining')).toBeInTheDocument();
  });

  it('hides the old nutrition sub-tab bar', () => {
    // Its function is absorbed by the top-level tabs. Seven navigation
    // targets became four; this asserts the old row is gone, not just moved.
    renderDashboard();
    expect(screen.queryByRole('tab', { name: 'Trends' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Analysis' })).not.toBeInTheDocument();
  });

  it('shows only one destination at a time', async () => {
    const { user } = renderDashboard();
    expect(screen.getByText('Calories Remaining')).toBeInTheDocument();
    await user.click(tab(/Goal/));
    expect(screen.queryByText('Calories Remaining')).not.toBeInTheDocument();
  });
});

describe('Today', () => {
  it('renders the food log', () => {
    renderDashboard();
    expect(screen.getByText('Calories Remaining')).toBeInTheDocument();
    for (const meal of ['Breakfast', 'Lunch', 'Dinner', 'Snack']) {
      expect(screen.getByText(meal)).toBeInTheDocument();
    }
  });

  it('keeps water quick-adds reachable', () => {
    renderDashboard();
    expect(screen.getByRole('button', { name: '+250 ml' })).toBeInTheDocument();
  });

  it('keeps the date navigator reachable', () => {
    renderDashboard();
    // "Today" is also the tab label now, so scope to the navigator's own row.
    expect(screen.getByRole('button', { name: /previous day/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next day/i })).toBeInTheDocument();
  });
});

describe('Body', () => {
  const withFood = { foodLogs: [aMealLog({ food: aFood({ calories: 420, protein: 28 }) })] };

  it('leads with body-system support', async () => {
    const { user } = renderDashboard(withFood);
    await user.click(tab(/Body/));
    expect(screen.getByText('Body System Support')).toBeInTheDocument();
  });

  it('keeps the micronutrient score, which feeds the badge', async () => {
    const { user } = renderDashboard(withFood);
    await user.click(tab(/Body/));
    expect(screen.getByText('Micronutrient Score')).toBeInTheDocument();
  });

  it('keeps the analysis detail below the systems', async () => {
    const { user } = renderDashboard(withFood);
    await user.click(tab(/Body/));
    for (const h of ['Daily Summary', 'Calorie Breakdown', 'Macro Targets', 'Micronutrient Breakdown']) {
      expect(screen.getByText(h), `lost surface: ${h}`).toBeInTheDocument();
    }
  });

  it('keeps the Micronutrient Snapshot, which moved here from Trends', async () => {
    // Inventory row 21. This one WAS silently dropped in the first cut of the
    // restructure: it lived in the Trends sub-tab, Trends was retired, and
    // nothing referenced it. No error, no failing test, no visual glitch --
    // it was only found by walking the inventory against the running app.
    const { user } = renderDashboard(withFood);
    await user.click(tab(/Body/));
    expect(screen.getByText('Micronutrient Snapshot')).toBeInTheDocument();
  });

  it('leads with the systems — they are what make the rest legible', async () => {
    const { user } = renderDashboard(withFood);
    await user.click(tab(/Body/));
    const order = ['Body System Support', 'Micronutrient Score', 'Micronutrient Snapshot', 'Micronutrient Breakdown']
      .map((h) => screen.getByText(h).compareDocumentPosition(screen.getByText('Body System Support')));
    // Every other heading must follow Body System Support in document order.
    expect(order.slice(1).every((p) => p & Node.DOCUMENT_POSITION_PRECEDING)).toBe(true);
  });

  it('keeps PDF export reachable', async () => {
    const { user } = renderDashboard(withFood);
    await user.click(tab(/Body/));
    expect(screen.getByRole('button', { name: /Export PDF/ })).toBeInTheDocument();
  });
});

describe('Goal', () => {
  it('leads with the goal panel', async () => {
    const { user } = renderDashboard();
    await user.click(tab(/Goal/));
    expect(screen.getByText('Your Goal')).toBeInTheDocument();
  });

  it('absorbs the quests that were their own tab', async () => {
    const { user } = renderDashboard();
    await user.click(tab(/Goal/));
    expect(screen.getByText("Today's Goals")).toBeInTheDocument();
    expect(screen.getByText('Hit Protein Target')).toBeInTheDocument();
  });

  it('still awards XP for completing a quest', async () => {
    const onUpdateGamification = vi.fn();
    const { user } = renderDashboard({ gamification: aGamification({ xp: 120 }), onUpdateGamification });
    await user.click(tab(/Goal/));
    await user.click(screen.getByText('Hit Protein Target'));
    const [state, delta] = onUpdateGamification.mock.calls[0];
    expect(state.xp).toBe(150);
    expect(delta).toBe(1);
  });

  it('badges the Goal tab with remaining quests', () => {
    renderDashboard();
    expect(within(tab(/Goal/)).getByText('2')).toBeInTheDocument();
  });

  it('keeps weight logging reachable', async () => {
    const onLogWeight = vi.fn();
    const { user } = renderDashboard({ onLogWeight });
    await user.click(tab(/Goal/));
    await user.type(screen.getByPlaceholderText(/weight/i), '73.5');
    await user.click(sectionFor('Body Weight').getByRole('button', { name: 'Log' }));
    expect(onLogWeight).toHaveBeenCalledWith(73.5);
  });

  it('keeps exercise and its dialog reachable', async () => {
    const { user } = renderDashboard({ exerciseLogs: [anExercise({ type: 'Running', xpEarned: 10 })] });
    await user.click(tab(/Goal/));
    expect(screen.getByText('Running')).toBeInTheDocument();
    await user.click(sectionFor('Exercise').getByRole('button', { name: 'Log' }));
    expect(await screen.findByRole('dialog', { name: 'Log Exercise' })).toBeInTheDocument();
  });

  it('absorbs the trend charts that were in Trends', async () => {
    const { user } = renderDashboard();
    await user.click(tab(/Goal/));
    expect(screen.getByRole('radio', { name: 'Last 7 days' })).toBeInTheDocument();
  });
});

describe('Coach', () => {
  it('is a destination of its own', async () => {
    const { user } = renderDashboard();
    await user.click(tab(/Coach/));
    expect(screen.getByRole('heading', { name: 'Coach' })).toBeInTheDocument();
  });

  it('stays anchored: offers the weakest system rather than a blank chat', async () => {
    const { user } = renderDashboard({
      foodLogs: [aMealLog({ food: aFood({ protein: 40, micros: { 'Vitamin C': 60 } }) })],
    });
    await user.click(tab(/Coach/));
    expect(screen.getByText(/weakest area/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask why/ })).toBeInTheDocument();
  });

  it('says so plainly when there is nothing logged to talk about', async () => {
    const { user } = renderDashboard({ foodLogs: [] });
    await user.click(tab(/Coach/));
    expect(screen.getByText(/Log some food first/i)).toBeInTheDocument();
  });
});

// ── Profile sheet: the surfaces that are not daily destinations ───────────
describe('Profile sheet', () => {
  const openProfile = async (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole('button', { name: /Open profile/i }));

  it('opens from the header', async () => {
    const { user } = renderDashboard();
    await openProfile(user);
    expect(await screen.findByRole('dialog', { name: /Your Plan/ })).toBeInTheDocument();
  });

  it('keeps PlanDisplay reachable, with its safety surfaces intact', async () => {
    // PlanDisplay carries the AI safetyDisclaimer, per-supplement cautions and
    // the isFallback banner. It must not be lost when its tab disappears.
    const { user } = renderDashboard();
    await openProfile(user);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Your Path Forward')).toBeInTheDocument();
    expect(within(dialog).getByText('Safe Supplementation')).toBeInTheDocument();
  });

  it('keeps achievements and stats reachable', async () => {
    const { user } = renderDashboard({ gamification: aGamification({ badges: ['century'] }) });
    await openProfile(user);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Achievements')).toBeInTheDocument();
    expect(within(dialog).getByText('Stats')).toBeInTheDocument();
  });

  it('keeps Start Over reachable, and still confirms first', async () => {
    const onReset = vi.fn();
    const { user } = renderDashboard({ onReset });
    await openProfile(user);
    await user.click(screen.getByRole('button', { name: 'Start Over' }));
    const confirm = await screen.findByRole('dialog', { name: 'Start Over?' });
    expect(onReset).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: /Yes, Start Over/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
