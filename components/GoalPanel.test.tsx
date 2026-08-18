import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GoalPanel } from './GoalPanel';
import { aProfile, aWeightEntry } from '../test/fixtures';
import { renderWithApp } from '../test/renderWithApp';
import { StoredWeightGoal } from '../types';

// 178cm: BMI 18.5 ≈ 58.6kg. Dates are far enough out to be a safe pace.
const FUTURE = '2027-06-01';

const renderPanel = (over: {
  weightKg?: number;
  history?: { date: string; kg: number }[];
  goal?: StoredWeightGoal | null;
  onSetGoal?: ReturnType<typeof vi.fn<(g: StoredWeightGoal | null) => void>>;
} = {}) => {
  const onSetGoal = over.onSetGoal ?? vi.fn<(g: StoredWeightGoal | null) => void>();
  const weightKg = over.weightKg ?? 82;
  const history = (over.history ?? [{ date: '2026-08-15', kg: weightKg }])
    .map(h => aWeightEntry(h));
  return {
    onSetGoal,
    user: userEvent.setup(),
    ...renderWithApp(<GoalPanel />, {
      profile: aProfile({ weightKg, heightCm: 178 }),
      weightHistory: history,
      weightGoal: over.goal ?? null,
      onSetWeightGoal: onSetGoal,
    }),
  };
};

const setTarget = async (user: ReturnType<typeof userEvent.setup>, kg: string, date = FUTURE) => {
  const weight = screen.getByLabelText(/Target weight/i);
  await user.clear(weight);
  await user.type(weight, kg);
  const when = screen.getByLabelText(/By when/i);
  await user.clear(when);
  await user.type(when, date);
};

describe('GoalPanel — setting a goal', () => {
  it('opens in edit mode when no goal is set', () => {
    renderPanel();
    expect(screen.getByLabelText(/Target weight/i)).toBeInTheDocument();
  });

  it('shows the current weight so the target has context', () => {
    renderPanel({ weightKg: 82 });
    expect(screen.getByText(/82 kg/)).toBeInTheDocument();
  });

  it('previews the plan before saving', async () => {
    const { user } = renderPanel({ weightKg: 82 });
    await setTarget(user, '78');
    expect(await screen.findByText(/4 kg/)).toBeInTheDocument();
  });

  it('saves a safe goal', async () => {
    const { user, onSetGoal } = renderPanel({ weightKg: 82 });
    await setTarget(user, '78');
    await user.click(screen.getByRole('button', { name: 'Set goal' }));
    expect(onSetGoal).toHaveBeenCalledTimes(1);
    expect(onSetGoal.mock.calls[0][0]).toMatchObject({ targetKg: 78, targetDate: FUTURE });
  });
});

// ── The UI must honour a refusal, not route around it ─────────────────────
describe('GoalPanel — refusals', () => {
  it('blocks saving a target below a healthy BMI', async () => {
    const { user, onSetGoal } = renderPanel({ weightKg: 74 });
    await setTarget(user, '52');   // BMI ~16.4 at 178cm
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set goal' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Set goal' }));
    expect(onSetGoal).not.toHaveBeenCalled();
  });

  it('explains the healthy floor rather than just rejecting', async () => {
    const { user } = renderPanel({ weightKg: 74 });
    await setTarget(user, '52');
    expect(await screen.findByRole('alert')).toHaveTextContent(/healthy BMI range/i);
  });

  it('offers a safe alternative that can be accepted in one tap', async () => {
    const { user, onSetGoal } = renderPanel({ weightKg: 74 });
    await setTarget(user, '52');
    const accept = await screen.findByRole('button', { name: /^Use \d/ });
    await user.click(accept);
    expect(onSetGoal).toHaveBeenCalledTimes(1);
    // Whatever it saved must clear the BMI floor.
    const saved = onSetGoal.mock.calls[0][0];
    expect(saved.targetKg / Math.pow(1.78, 2)).toBeGreaterThanOrEqual(18.5);
  });

  it('blocks a crash-diet pace and offers a later date', async () => {
    const { user, onSetGoal } = renderPanel({ weightKg: 82 });
    await setTarget(user, '70', '2026-09-14');   // ~2.8 kg/week
    expect(await screen.findByRole('alert')).toHaveTextContent(/per week/i);
    expect(screen.getByRole('button', { name: 'Set goal' })).toBeDisabled();
    expect(onSetGoal).not.toHaveBeenCalled();
  });

  it('refuses any further loss when already below a healthy BMI', async () => {
    const { user, onSetGoal } = renderPanel({ weightKg: 55 });   // BMI ~17.4
    await setTarget(user, '52');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/doctor|dietitian/i);
    // No alternative — there is no safe version of this request.
    expect(screen.queryByRole('button', { name: /^Use \d/ })).not.toBeInTheDocument();
    expect(onSetGoal).not.toHaveBeenCalled();
  });

  it('never shows a calorie target alongside a refusal', async () => {
    const { user } = renderPanel({ weightKg: 74 });
    await setTarget(user, '52');
    await screen.findByRole('alert');
    expect(screen.queryByText(/calorie target/i)).not.toBeInTheDocument();
  });

  it('still allows an underweight user to set a gain goal', async () => {
    const { user, onSetGoal } = renderPanel({ weightKg: 55 });
    await setTarget(user, '62');
    await user.click(screen.getByRole('button', { name: 'Set goal' }));
    expect(onSetGoal).toHaveBeenCalledTimes(1);
  });
});

describe('GoalPanel — active goal', () => {
  const goal: StoredWeightGoal = { targetKg: 78, targetDate: FUTURE, setOn: '2026-08-15' };

  it('shows the plan instead of the editor', () => {
    renderPanel({ weightKg: 82, goal });
    expect(screen.queryByLabelText(/Target weight/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Today's calorie target/i)).toBeInTheDocument();
  });

  it('summarises what is left', () => {
    renderPanel({ weightKg: 82, goal });
    expect(screen.getByText('To go')).toBeInTheDocument();
    expect(screen.getByText('Days left')).toBeInTheDocument();
  });

  it('reports pace once there are two weigh-ins a week apart', () => {
    renderPanel({
      weightKg: 80, goal,
      history: [{ date: '2026-08-01', kg: 82 }, { date: '2026-08-15', kg: 80 }],
    });
    expect(screen.getByText(/On track|Off track/)).toBeInTheDocument();
  });

  it('gives no verdict without enough history', () => {
    renderPanel({ weightKg: 82, goal, history: [{ date: '2026-08-15', kg: 82 }] });
    expect(screen.queryByText(/On track|Off track/)).not.toBeInTheDocument();
  });

  it('carries a not-medical-advice note', () => {
    renderPanel({ weightKg: 82, goal });
    expect(screen.getByText(/Not medical advice/i)).toBeInTheDocument();
  });

  it('can be edited or cleared', async () => {
    const { user, onSetGoal } = renderPanel({ weightKg: 82, goal });
    await user.click(screen.getByRole('button', { name: /Edit/ }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onSetGoal).toHaveBeenCalledWith(null);
  });

  it('surfaces a saved goal that has since become unsafe', () => {
    // The user set 52kg when heavier and has since dropped below the floor.
    renderPanel({ weightKg: 55, goal: { targetKg: 52, targetDate: FUTURE, setOn: '2026-01-01' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Update goal/ })).toBeInTheDocument();
  });
});
