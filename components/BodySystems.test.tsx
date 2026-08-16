import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BodySystems } from './BodySystems';
import { BODY_SYSTEMS } from '../utils/bodySystems';
import { NUTRIENT_INFO } from '../data/nutrientData';
import { MacroTargets } from '../types';

const targets: MacroTargets = { calories: 2654, protein: 118, carbs: 355, fat: 74 };

const perfect = (): Record<string, number> => {
  const out: Record<string, number> = { Protein: targets.protein };
  for (const s of BODY_SYSTEMS) {
    for (const n of s.nutrients) {
      const t = NUTRIENT_INFO[n]?.targetVal;
      if (t) out[n] = t;
    }
  }
  return out;
};

const renderSystems = (consumed: Record<string, number> = {}) => ({
  user: userEvent.setup(),
  ...render(<BodySystems consumedMicros={consumed} targets={targets} />),
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

  it('shows every system at full support when targets are met', () => {
    renderSystems(perfect());
    expect(screen.getAllByText('Strong')).toHaveLength(7);
  });

  it('shows low support with nothing logged', () => {
    renderSystems();
    expect(screen.getAllByText('Low')).toHaveLength(7);
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
    const { user } = renderSystems(perfect());
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
