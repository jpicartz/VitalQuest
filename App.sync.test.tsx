import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
/**
 * The first sync onto a NEW device.
 *
 * This is the whole point of the feature and the path with no local data to
 * fall back on, so it gets a test at the App level rather than being inferred
 * from the units. It caught a real failure: the snapshot was pulled, merged and
 * saved correctly, and the user was still looking at the onboarding form —
 * which, if completed, would have overwritten what had just arrived.
 */

// Stands in for the whole crypto + network layer: this is about what the app
// DOES with a successful sync, not how the bytes travel. Hoisted by vitest, so
// the factory builds its own data rather than closing over anything.
vi.mock('./services/syncService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./services/syncService')>();
  const { aProfile: p, aMetrics: m, aPlan: pl } = await import('./test/fixtures');
  return {
    ...actual,
    savedCode: () => 'A'.repeat(26),
    takeCodeFromUrl: () => null,
    syncNow: vi.fn().mockResolvedValue({
      data: {
        profile: p(), metrics: m(), plan: pl(),
        foodLogs: [], waterLog: { date: '2026-01-01', mlConsumed: 0 },
        weightHistory: [], favouriteFoods: [], recipes: [], exerciseLogs: [],
        gamification: { xp: 0, level: 1, streak: 0, badges: [], completedQuestIds: [] },
        lifetimeQuestsCompleted: 0, weightGoal: null,
      },
      summary: { added: 3, fromRemote: true },
      syncedAt: 1000,
    }),
  };
});

beforeEach(() => { localStorage.clear(); });

afterEach(() => { localStorage.clear(); });

describe('first sync onto a fresh device', () => {
  it('leaves the onboarding form once a complete profile arrives', async () => {
    render(<App />);
    // Starts on onboarding, because this device has nothing stored.
    expect(screen.getByText(/start with the basics/i)).toBeInTheDocument();

    // Once the sync resolves, the app must move on by itself.
    await waitFor(() => {
      expect(screen.queryByText(/start with the basics/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('persists what arrived, so a reload also lands on the dashboard', async () => {
    render(<App />);
    await waitFor(() => {
      expect(localStorage.getItem('vitalQuestData')).toBeTruthy();
    }, { timeout: 3000 });
    const saved = JSON.parse(localStorage.getItem('vitalQuestData')!);
    expect(saved.profile).toBeTruthy();
    expect(saved.metrics).toBeTruthy();
    expect(saved.plan).toBeTruthy();
  });
});
