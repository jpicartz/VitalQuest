import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BodySystems } from './BodySystems';
import { BODY_SYSTEMS } from '../utils/bodySystems';
import { NUTRIENT_INFO } from '../data/nutrientData';
import { MacroTargets } from '../types';

const targets: MacroTargets = { calories: 2654, protein: 118, carbs: 355, fat: 74 };

/** Every nutrient at target. `over` starves specific ones to force a gap. */
const perfect = (over: Record<string, number> = {}): Record<string, number> => {
  const out: Record<string, number> = { Protein: targets.protein };
  for (const s of BODY_SYSTEMS) {
    for (const n of s.nutrients) {
      const t = NUTRIENT_INFO[n]?.targetVal;
      if (t) out[n] = t;
    }
  }
  return { ...out, ...over };
};

const macros = (over: Partial<{ protein: number; carbs: number; fat: number }> = {}) =>
  ({ protein: 0, carbs: 0, fat: 0, ...over });

const renderSystems = (
  consumed: Record<string, number> = {},
  consumedMacros = macros()
) => ({
  user: userEvent.setup(),
  ...render(<BodySystems consumedMicros={consumed} consumedMacros={consumedMacros} targets={targets} />),
});

describe('BodySystems', () => {
  it('shows all seven systems', () => {
    renderSystems();
    for (const label of ['Hair & Nails', 'Skin', 'Muscle', 'Hormonal', 'Energy', 'Immune', 'Bone']) {
      expect(screen.getByText(label), `missing ${label}`).toBeInTheDocument();
    }
  });

  it('states plainly that this reflects intake, not the body', () => {
    // The honesty guard. If this copy is ever softened into a claim about the
    // user's actual skin or hormones, this test should fail.
    renderSystems();
    expect(screen.getByText(/reflects what you ate/i)).toBeInTheDocument();
    expect(screen.getByText(/not a measurement of your body/i)).toBeInTheDocument();
  });

  it('labels every system as "support", never as a grade', () => {
    const { container } = renderSystems();
    expect(container.textContent).toMatch(/Body System Support/);
    expect(container.textContent).not.toMatch(/grade/i);
  });

  it('renders no NaN with hostile input', () => {
    const { container } = renderSystems({ Zinc: '11mg' as never, Iron: NaN, Protein: -5 });
    expect(container.textContent).not.toMatch(/NaN/);
  });

  // The featured "weakest today" tile reads "<Band> support"; the six compact
  // tiles read "<Band>". Matching the leading word covers both without
  // pinning the copy of either.
  const bandTiles = (band: string) =>
    screen.getAllByText((_, el) => el?.textContent?.trim().startsWith(band) === true
      && el.className.includes('uppercase'));

  it('shows every system at full support when targets are met', () => {
    renderSystems(perfect(), macros({ protein: targets.protein, carbs: targets.carbs, fat: targets.fat }));
    expect(bandTiles('Strong')).toHaveLength(7);
  });

  it('shows low support with nothing logged', () => {
    renderSystems();
    expect(bandTiles('Low')).toHaveLength(7);
  });

  it('ranks the systems worst-first so the order carries information', () => {
    // Zinc feeds Hair & Nails, Skin and Hormonal; starving it while everything
    // else is met must push those to the front.
    renderSystems(perfect({ Zinc: 0 }), macros({ protein: targets.protein, carbs: targets.carbs, fat: targets.fat }));
    const scores = screen.getAllByRole('button')
      .map((b) => Number(b.getAttribute('aria-label')?.match(/(\d+) percent/)?.[1]))
      .filter((n) => Number.isFinite(n));
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
  });

  it('makes the headline and the weakest tile name the same nutrient', () => {
    // These sit adjacent, and both look like the answer to "what do I fix?".
    // Sorting the tile's gaps by severity alone made them disagree.
    renderSystems(perfect({ Zinc: 0, Biotin: 0.1 }), macros({ protein: targets.protein, carbs: targets.carbs, fat: targets.fat }));
    const headline = screen.getByText(/is holding back/).textContent ?? '';
    const shared = headline.match(/^(\S+)/)?.[1] ?? '';
    const featured = screen.getByRole('button', { name: /weakest today/i }).textContent ?? '';
    expect(featured, `headline names ${shared}, tile says: ${featured}`).toContain(shared);
  });

  it('names the nutrient limiting more than one system', () => {
    renderSystems(perfect({ Zinc: 0 }), macros({ protein: targets.protein, carbs: targets.carbs, fat: targets.fat }));
    expect(screen.getByText(/is holding back/)).toHaveTextContent(/Zinc is holding back \d+ systems/);
  });

  it('exposes each system as a labelled button for keyboard users', () => {
    renderSystems();
    expect(screen.getByRole('button', { name: /Hair & Nails support, \d+ percent/ })).toBeInTheDocument();
  });
});

describe('BodySystems — drill-in', () => {
  it('opens a detail dialog naming the system', async () => {
    const { user } = renderSystems();
    await user.click(screen.getByRole('button', { name: /Skin support/ }));
    expect(await screen.findByRole('dialog', { name: 'Skin Support' })).toBeInTheDocument();
  });

  it('lists the contributing nutrients', async () => {
    const { user } = renderSystems();
    await user.click(screen.getByRole('button', { name: /Bone support/ }));
    const dialog = await screen.findByRole('dialog');
    for (const n of ['Calcium', 'Vitamin D', 'Vitamin K', 'Magnesium']) {
      expect(within(dialog).getByText(n), `missing contributor ${n}`).toBeInTheDocument();
    }
  });

  it('suggests foods for nutrients that are short', async () => {
    const { user } = renderSystems();
    await user.click(screen.getByRole('button', { name: /Bone support/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/^Try: /).length).toBeGreaterThan(0);
  });

  it('confirms when nothing is short rather than inventing a gap', async () => {
    const { user } = renderSystems(perfect(), macros({ protein: targets.protein, carbs: targets.carbs, fat: targets.fat }));
    await user.click(screen.getByRole('button', { name: /Immune support/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/at least halfway/i)).toBeInTheDocument();
  });

  it('carries a not-medical-advice note into the detail view', async () => {
    const { user } = renderSystems();
    await user.click(screen.getByRole('button', { name: /Energy support/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Not medical advice/i)).toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    const { user } = renderSystems();
    await user.click(screen.getByRole('button', { name: /Muscle support/ }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
