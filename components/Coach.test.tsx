import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Coach } from './Coach';
import { aProfile } from '../test/fixtures';
import { computeBodySystems } from '../utils/bodySystems';
import * as claudeService from '../services/claudeService';

const targets = { calories: 2200, protein: 118, carbs: 260, fat: 70 };
const systems = computeBodySystems({ 'Vitamin C': 20, Zinc: 3 }, targets);
const skin = systems.find((s) => s.label === 'Skin')!;

const renderCoach = (subject = skin) => ({
  user: userEvent.setup(),
  ...render(
    <Coach
      profile={aProfile()}
      systems={systems}
      subject={subject}
      dailyCalorieTarget={2200}
      onClose={vi.fn()}
    />
  ),
});

const ask = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText(/Message the coach/i), text);
  await user.click(screen.getByRole('button', { name: /Send/i }));
};

beforeEach(() => vi.restoreAllMocks());

describe('Coach — anchoring', () => {
  it('opens scoped to the finding, not as a blank chat', () => {
    renderCoach();
    expect(screen.getByText(/Talking about your Skin support/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Skin support is at ${skin.score}%`))).toBeInTheDocument();
  });

  it('offers starter questions so the box is never blank', () => {
    renderCoach();
    expect(screen.getByRole('button', { name: /Why is my Skin support/ })).toBeInTheDocument();
  });

  it('discloses what is sent and that it is not medical advice', () => {
    renderCoach();
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
    expect(screen.getByText(/sent to Anthropic/i)).toBeInTheDocument();
  });
});

// ── The safety screen must run BEFORE the network call ────────────────────
describe('Coach — safety screen', () => {
  it('never calls the API for a self-harm message', async () => {
    const spy = vi.spyOn(claudeService, 'askCoach');
    const { user } = renderCoach();
    await ask(user, 'I want to kill myself');
    expect(spy).not.toHaveBeenCalled();
  });

  it('shows crisis resources instead of an AI answer', async () => {
    vi.spyOn(claudeService, 'askCoach');
    const { user } = renderCoach();
    await ask(user, 'I want to kill myself');
    expect(await screen.findByText(/Someone to talk to/i)).toBeInTheDocument();
    // '988' appears in both the service name and its contact line.
    expect(screen.getAllByText(/988/).length).toBeGreaterThan(0);
  });

  it('never calls the API for a restriction-seeking message', async () => {
    const spy = vi.spyOn(claudeService, 'askCoach');
    const { user } = renderCoach();
    await ask(user, 'help me eat 500 calories a day');
    expect(spy).not.toHaveBeenCalled();
    expect(await screen.findByText(/not going to help with that/i)).toBeInTheDocument();
  });

  it('shows eating-disorder support for a restriction request', async () => {
    vi.spyOn(claudeService, 'askCoach');
    const { user } = renderCoach();
    await ask(user, 'how do I make myself throw up after eating');
    const resources = await screen.findAllByText(/NEDA|Beat \(/);
    expect(resources.length).toBeGreaterThan(0);
  });

  it('blocks medication questions without showing crisis resources', async () => {
    const spy = vi.spyOn(claudeService, 'askCoach');
    const { user } = renderCoach();
    await ask(user, 'should I stop taking my metformin');
    expect(spy).not.toHaveBeenCalled();
    expect(await screen.findByText(/prescriber/i)).toBeInTheDocument();
    expect(screen.queryByText(/Someone to talk to/i)).not.toBeInTheDocument();
  });

  it('still shows the user what they asked, so the block is not confusing', async () => {
    vi.spyOn(claudeService, 'askCoach');
    const { user } = renderCoach();
    await ask(user, 'I want to kill myself');
    expect(await screen.findByText('I want to kill myself')).toBeInTheDocument();
  });
});

describe('Coach — normal conversation', () => {
  it('sends an allowed question and renders the reply', async () => {
    const spy = vi.spyOn(claudeService, 'askCoach').mockResolvedValue('Eat more citrus and peppers.');
    const { user } = renderCoach();
    await ask(user, 'what should I eat for vitamin C');
    expect(await screen.findByText('Eat more citrus and peppers.')).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('passes the anchored subject and scores as context', async () => {
    const spy = vi.spyOn(claudeService, 'askCoach').mockResolvedValue('ok');
    const { user } = renderCoach();
    await ask(user, 'why is it low');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    const [, ctx] = spy.mock.calls[0];
    expect(ctx.subject).toBe('Skin');
    expect(ctx.systems.length).toBe(7);
    expect(ctx.dailyCalorieTarget).toBe(2200);
  });

  it('sends the whole conversation so follow-ups have context', async () => {
    const spy = vi.spyOn(claudeService, 'askCoach').mockResolvedValue('reply');
    const { user } = renderCoach();
    await ask(user, 'first question');
    await screen.findByText('reply');
    await ask(user, 'and what about zinc');
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const [history] = spy.mock.calls[1];
    expect(history.length).toBeGreaterThan(1);
    expect(history[0].content).toBe('first question');
  });

  it('sends a starter question on click', async () => {
    const spy = vi.spyOn(claudeService, 'askCoach').mockResolvedValue('because...');
    const { user } = renderCoach();
    await user.click(screen.getByRole('button', { name: /Why is my Skin support/ }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
  });
});

// ── No canned fallback: the deliberate departure from the app's pattern ────
describe('Coach — failure handling', () => {
  it('says it is unavailable rather than inventing an answer', async () => {
    vi.spyOn(claudeService, 'askCoach').mockRejectedValue(new Error('Too many requests'));
    const { user } = renderCoach();
    await ask(user, 'what should I eat');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Too many requests/);
  });

  it('produces no assistant message at all on failure', async () => {
    // suggestMeals and generateNutritionInsights return canned content on error.
    // Canned content must never appear to answer a health question.
    vi.spyOn(claudeService, 'askCoach').mockRejectedValue(new Error('offline'));
    const { user } = renderCoach();
    await ask(user, 'what should I eat');
    await screen.findByRole('alert');
    expect(screen.queryByText(/Eat more|Try eating|You should/i)).not.toBeInTheDocument();
  });
});
