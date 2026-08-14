import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import {
  aProfile, aMetrics, aPlan, aGamification, aMealLog,
  aWaterLog, aWeightEntry, anExercise, TODAY,
} from '../test/fixtures';

/**
 * Smoke tests written against the CURRENT (v1) information architecture:
 * 4 tabs — My Plan / Nutrition / Quests / Progress.
 *
 * These exist specifically to protect the v2 navigation restructure. The 200
 * pure-logic tests would not notice a whole destination going missing; these
 * will. When the IA changes, rewriting these IS the migration checklist.
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

/**
 * Scope a query to the section owning a heading. Both "Body Weight" and
 * "Exercise" render a button labelled "Log", so an unscoped query is ambiguous.
 */
const sectionFor = (heading: string) => {
  const el = screen.getByText(heading).closest('section');
  if (!el) throw new Error(`No <section> wrapping heading "${heading}"`);
  return within(el);
};

describe('Dashboard — always-visible header', () => {
  it('shows level, XP, streak and calories', () => {
    renderDashboard({ gamification: aGamification({ xp: 120, level: 2, streak: 5 }) });
    // NB: the visual uppercase is CSS, so the DOM text is "Level".
    expect(screen.getByText('Level')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('day streak')).toBeInTheDocument();
    expect(screen.getByText('kcal eaten')).toBeInTheDocument();
  });

  it('sums calories from the logs it is given', () => {
    renderDashboard({
      foodLogs: [
        aMealLog({ food: { ...aMealLog().food, calories: 400 } }),
        aMealLog({ food: { ...aMealLog().food, calories: 350 } }),
      ],
    });
    expect(screen.getByText('750')).toBeInTheDocument();
  });

  it('renders earned badges and hides the row when there are none', () => {
    const { unmount } = renderDashboard({ gamification: aGamification({ badges: ['century'] }) });
    expect(screen.getByText('Century')).toBeInTheDocument();
    unmount();
    renderDashboard({ gamification: aGamification({ badges: [] }) });
    expect(screen.queryByText('Century')).not.toBeInTheDocument();
  });
});

describe('Dashboard — the four destinations', () => {
  it('exposes exactly four tabs', () => {
    renderDashboard();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs.map((t) => t.textContent?.replace(/\d+$/, '').trim()))
      .toEqual(['My Plan', 'Nutrition', 'Quests', 'Progress']);
  });

  it('opens on My Plan', () => {
    renderDashboard();
    expect(tab(/My Plan/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Your Path Forward')).toBeInTheDocument();
  });

  it('reaches the Nutrition destination', async () => {
    const { user } = renderDashboard();
    await user.click(tab(/Nutrition/));
    expect(screen.getByText('Food Log')).toBeInTheDocument();
    expect(screen.getByText('Calories Remaining')).toBeInTheDocument();
  });

  it('reaches the Quests destination', async () => {
    const { user } = renderDashboard();
    await user.click(tab(/Quests/));
    expect(screen.getByText("Today's Goals")).toBeInTheDocument();
    expect(screen.getByText('Hit Protein Target')).toBeInTheDocument();
  });

  it('reaches the Progress destination', async () => {
    const { user } = renderDashboard();
    await user.click(tab(/Progress/));
    expect(screen.getByText('Body Weight')).toBeInTheDocument();
    expect(screen.getByText('Exercise')).toBeInTheDocument();
    expect(screen.getByText('Achievements')).toBeInTheDocument();
  });

  it('shows only one destination at a time', async () => {
    const { user } = renderDashboard();
    expect(screen.getByText('Your Path Forward')).toBeInTheDocument();
    await user.click(tab(/Progress/));
    expect(screen.queryByText('Your Path Forward')).not.toBeInTheDocument();
    expect(screen.getByText('Body Weight')).toBeInTheDocument();
  });

  it('badges the Quests tab with the remaining count', () => {
    renderDashboard({ gamification: aGamification({ completedQuestIds: [] }) });
    expect(within(tab(/Quests/)).getByText('2')).toBeInTheDocument();
  });
});

describe('Dashboard — quest completion', () => {
  it('awards XP and marks the quest complete', async () => {
    const onUpdateGamification = vi.fn();
    const { user } = renderDashboard({
      gamification: aGamification({ xp: 120, level: 2 }),
      onUpdateGamification,
    });
    await user.click(tab(/Quests/));
    await user.click(screen.getByText('Hit Protein Target'));

    expect(onUpdateGamification).toHaveBeenCalledTimes(1);
    const [state, delta] = onUpdateGamification.mock.calls[0];
    expect(state.xp).toBe(150);                       // 120 + 30
    expect(state.completedQuestIds).toContain('quest-1');
    expect(delta).toBe(1);
  });

  it('does not re-award an already-completed quest', async () => {
    const onUpdateGamification = vi.fn();
    const { user } = renderDashboard({
      gamification: aGamification({ completedQuestIds: ['quest-1'] }),
      onUpdateGamification,
    });
    await user.click(tab(/Quests/));
    await user.click(screen.getByText('Hit Protein Target'));
    expect(onUpdateGamification).not.toHaveBeenCalled();
  });
});

describe('Dashboard — weight logging', () => {
  it('submits a plausible weight', async () => {
    const onLogWeight = vi.fn();
    const { user } = renderDashboard({ onLogWeight });
    await user.click(tab(/Progress/));
    await user.type(screen.getByPlaceholderText(/weight/i), '73.5');
    await user.click(sectionFor('Body Weight').getByRole('button', { name: 'Log' }));
    expect(onLogWeight).toHaveBeenCalledWith(73.5);
  });

  it('rejects an implausible weight rather than logging it', async () => {
    const onLogWeight = vi.fn();
    const { user } = renderDashboard({ onLogWeight });
    await user.click(tab(/Progress/));
    await user.type(screen.getByPlaceholderText(/weight/i), '900');
    await user.click(sectionFor('Body Weight').getByRole('button', { name: 'Log' }));
    expect(onLogWeight).not.toHaveBeenCalled();
  });

  it('shows starting, current and change from weight history', async () => {
    const { user } = renderDashboard({
      weightHistory: [
        aWeightEntry({ date: '2026-01-01', kg: 78, isBaseline: true }),
        aWeightEntry({ date: TODAY, kg: 74 }),
      ],
    });
    await user.click(tab(/Progress/));
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText('74')).toBeInTheDocument();
    expect(screen.getByText('-4')).toBeInTheDocument();
  });
});

describe('Dashboard — exercise', () => {
  it('lists today\'s exercise with earned XP', async () => {
    const { user } = renderDashboard({
      exerciseLogs: [anExercise({ type: 'Running', durationMin: 30, xpEarned: 10 })],
    });
    await user.click(tab(/Progress/));
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('+10 XP')).toBeInTheDocument();
  });

  it('opens the log-exercise dialog', async () => {
    const { user } = renderDashboard();
    await user.click(tab(/Progress/));
    await user.click(sectionFor('Exercise').getByRole('button', { name: 'Log' }));
    expect(await screen.findByRole('dialog', { name: 'Log Exercise' })).toBeInTheDocument();
  });
});

describe('Dashboard — destructive actions are confirmed', () => {
  it('asks before starting over', async () => {
    const onReset = vi.fn();
    const { user } = renderDashboard({ onReset });
    await user.click(screen.getByRole('button', { name: 'Start Over' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start Over?' });
    expect(onReset).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: /Yes, Start Over/ }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
