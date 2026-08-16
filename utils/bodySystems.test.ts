import { describe, it, expect } from 'vitest';
import {
  BODY_SYSTEMS, computeBodySystems, nutrientPct, supportBand,
} from './bodySystems';
import { NUTRIENT_INFO } from '../data/nutrientData';
import { MICRO_KEY_MAP } from '../services/claudeService';
import { MacroTargets } from '../types';

const targets: MacroTargets = { calories: 2654, protein: 118, carbs: 355, fat: 74 };

/** Consumption map hitting exactly 100% of every nutrient any system uses. */
const perfect = (): Record<string, number> => {
  const out: Record<string, number> = { Protein: targets.protein };
  for (const sys of BODY_SYSTEMS) {
    for (const n of sys.nutrients) {
      const t = NUTRIENT_INFO[n]?.targetVal;
      if (t) out[n] = t;
    }
  }
  return out;
};

describe('nutrientPct', () => {
  it('scores a met micronutrient target at 100', () => {
    expect(nutrientPct('Zinc', { Zinc: 11 }, targets)?.pct).toBe(100);
  });

  it('scores half a target at 50', () => {
    expect(nutrientPct('Zinc', { Zinc: 5.5 }, targets)?.pct).toBe(50);
  });

  it('clamps above 100 so one megadose cannot carry a system', () => {
    expect(nutrientPct('Zinc', { Zinc: 1100 }, targets)?.pct).toBe(100);
  });

  it('clamps negatives to 0', () => {
    expect(nutrientPct('Zinc', { Zinc: -50 }, targets)?.pct).toBe(0);
  });

  it('scores an absent nutrient at 0', () => {
    expect(nutrientPct('Zinc', {}, targets)?.pct).toBe(0);
  });

  it('coerces a string amount without producing NaN', () => {
    const r = nutrientPct('Zinc', { Zinc: '11mg' } as never, targets);
    expect(Number.isNaN(r?.pct)).toBe(false);
    expect(r?.pct).toBe(0);
  });

  // Protein has no targetVal in NUTRIENT_INFO — it is per-user via MacroTargets.
  it('reads Protein from MacroTargets, not NUTRIENT_INFO', () => {
    expect(NUTRIENT_INFO.Protein?.targetVal).toBeUndefined();
    expect(nutrientPct('Protein', { Protein: 118 }, targets)?.pct).toBe(100);
    expect(nutrientPct('Protein', { Protein: 59 }, targets)?.pct).toBe(50);
  });

  it('returns null when no target can be resolved', () => {
    expect(nutrientPct('Protein', { Protein: 50 }, { ...targets, protein: 0 })).toBeNull();
    expect(nutrientPct('NotARealNutrient', {}, targets)).toBeNull();
  });

  // ── Ceilings: Sodium and Sugar are limits, not goals ─────────────────────
  it('scores a ceiling nutrient 100 while under the limit', () => {
    expect(nutrientPct('Sodium', { Sodium: 1000 }, targets)?.pct).toBe(100);
    expect(nutrientPct('Sodium', { Sodium: 2300 }, targets)?.pct).toBe(100);
  });

  it('penalises a ceiling nutrient once exceeded', () => {
    expect(nutrientPct('Sodium', { Sodium: 3450 }, targets)?.pct).toBe(50);  // 1.5x
    expect(nutrientPct('Sodium', { Sodium: 4600 }, targets)?.pct).toBe(0);   // 2x
    expect(nutrientPct('Sodium', { Sodium: 9999 }, targets)?.pct).toBe(0);
  });

  it('flags ceilings so the UI can word them differently', () => {
    expect(nutrientPct('Sodium', { Sodium: 100 }, targets)?.isCeiling).toBe(true);
    expect(nutrientPct('Zinc', { Zinc: 11 }, targets)?.isCeiling).toBe(false);
  });

  it('does NOT reward eating more salt', () => {
    // The bug this guards: a naive consumed/target loop scores 2300mg sodium
    // as "100% achieved" and 4600mg as even better.
    const low = nutrientPct('Sodium', { Sodium: 500 }, targets)!.pct;
    const high = nutrientPct('Sodium', { Sodium: 5000 }, targets)!.pct;
    expect(high).toBeLessThan(low);
  });
});

describe('computeBodySystems', () => {
  it('returns all seven systems', () => {
    const systems = computeBodySystems({}, targets);
    expect(systems).toHaveLength(7);
    expect(systems.map((s) => s.id)).toEqual([
      'hair-nails', 'skin', 'muscle', 'hormonal', 'energy', 'immune', 'bone',
    ]);
  });

  it('scores every system 0 with nothing logged', () => {
    for (const s of computeBodySystems({}, targets)) expect(s.score).toBe(0);
  });

  it('scores every system 100 when all its nutrients hit target', () => {
    for (const s of computeBodySystems(perfect(), targets)) {
      expect(s.score, `${s.label} should be 100`).toBe(100);
    }
  });

  it('scores 50 at half of every target', () => {
    const half = Object.fromEntries(Object.entries(perfect()).map(([k, v]) => [k, v / 2]));
    for (const s of computeBodySystems(half, targets)) {
      expect(s.score, `${s.label} should be 50`).toBe(50);
    }
  });

  it('keeps every score within 0..100 for hostile input', () => {
    for (const consumed of [{}, { Zinc: -999 }, { Iron: 1e9 }, { Protein: NaN }]) {
      for (const s of computeBodySystems(consumed as never, targets)) {
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(Number.isNaN(s.score)).toBe(false);
      }
    }
  });

  it('moves only the systems a nutrient belongs to', () => {
    // Biotin is in Hair & Nails and nowhere else.
    const systems = computeBodySystems({ Biotin: 30 }, targets);
    const hair = systems.find((s) => s.id === 'hair-nails')!;
    const bone = systems.find((s) => s.id === 'bone')!;
    expect(hair.score).toBeGreaterThan(0);
    expect(bone.score).toBe(0);
  });

  it('orders contributions weakest first so the UI leads with the gap', () => {
    const systems = computeBodySystems({ Zinc: 11, Iron: 1, Protein: 118 }, targets);
    const hair = systems.find((s) => s.id === 'hair-nails')!;
    const pcts = hair.contributions.map((c) => c.pct);
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
  });

  it('reports gaps as the sub-50% contributors', () => {
    const hair = computeBodySystems({ Protein: 118, Zinc: 11 }, targets)
      .find((s) => s.id === 'hair-nails')!;
    const gapNames = hair.gaps.map((g) => g.nutrient);
    expect(gapNames).toContain('Biotin');   // absent → 0%
    expect(gapNames).not.toContain('Zinc'); // at target → 100%
    expect(hair.gaps.every((g) => g.pct < 50)).toBe(true);
  });

  it('carries the label and blurb for display', () => {
    const skin = computeBodySystems({}, targets).find((s) => s.id === 'skin')!;
    expect(skin.label).toBe('Skin');
    expect(skin.blurb).toMatch(/collagen/i);
  });
});

describe('supportBand', () => {
  it.each([
    [0, 'low'], [34, 'low'],
    [35, 'building'], [59, 'building'],
    [60, 'solid'], [84, 'solid'],
    [85, 'strong'], [100, 'strong'],
  ] as const)('%i is %s', (score, band) => {
    expect(supportBand(score)).toBe(band);
  });
});

// ── The invariant the whole feature rests on ───────────────────────────────
describe('body-system nutrient invariants', () => {
  it('every referenced nutrient resolves to a real target', () => {
    // Body systems reach well outside PRIORITY_MICROS — Biotin, Vitamin A/E/K,
    // Selenium, Iodine, Choline, Manganese, Riboflavin, Thiamin. If any loses
    // its targetVal, that nutrient silently drops out of the mean and every
    // score using it shifts with no error anywhere.
    for (const system of BODY_SYSTEMS) {
      for (const nutrient of system.nutrients) {
        const isMacro = ['Protein', 'Carbohydrates', 'Fats'].includes(nutrient);
        if (isMacro) continue;
        const info = NUTRIENT_INFO[nutrient];
        expect(info, `${system.label} references unknown nutrient "${nutrient}"`).toBeDefined();
        expect(info.targetVal, `"${nutrient}" has no targetVal`).toBeGreaterThan(0);
        expect(info.unit, `"${nutrient}" has no unit`).toBeTruthy();
      }
    }
  });

  it('every referenced micronutrient is reachable from the AI parser', () => {
    // If the model has no alias mapping to a canonical key, that nutrient can
    // never be logged, so its system is permanently capped below 100.
    const canonical = new Set(Object.values(MICRO_KEY_MAP));
    for (const system of BODY_SYSTEMS) {
      for (const nutrient of system.nutrients) {
        if (['Protein', 'Carbohydrates', 'Fats'].includes(nutrient)) continue;
        expect(canonical.has(nutrient), `no MICRO_KEY_MAP alias resolves to "${nutrient}"`).toBe(true);
      }
    }
  });

  it('has no duplicate nutrients within a single system', () => {
    for (const s of BODY_SYSTEMS) {
      expect(new Set(s.nutrients).size, `${s.label} lists a nutrient twice`).toBe(s.nutrients.length);
    }
  });

  it('gives every system at least three contributors', () => {
    // Fewer than three and one nutrient swings the score too hard to be useful.
    for (const s of BODY_SYSTEMS) {
      expect(s.nutrients.length, `${s.label} is too thin`).toBeGreaterThanOrEqual(3);
    }
  });
});
