import { describe, it, expect } from 'vitest';
import {
  BODY_SYSTEMS, computeBodySystems, nutrientPct, supportBand,
} from './bodySystems';
import { NUTRIENT_INFO } from '../data/nutrientData';
import { MICRO_KEY_MAP } from '../services/claudeService';
import { MacroTargets } from '../types';

const targets: MacroTargets = { calories: 2654, protein: 118, carbs: 355, fat: 74 };

/** Macros are passed separately: protein never reaches the micros map. */
const macros = (over: Partial<{ protein: number; carbs: number; fat: number }> = {}) =>
  ({ protein: 0, carbs: 0, fat: 0, ...over });
const fullMacros = macros({ protein: targets.protein, carbs: targets.carbs, fat: targets.fat });

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
    const systems = computeBodySystems({}, targets, macros());
    expect(systems).toHaveLength(7);
    expect(systems.map((s) => s.id)).toEqual([
      'hair-nails', 'skin', 'muscle', 'hormonal', 'energy', 'immune', 'bone',
    ]);
  });

  it('scores every system 0 with nothing logged', () => {
    for (const s of computeBodySystems({}, targets, macros())) expect(s.score).toBe(0);
  });

  it('scores every system 100 when all its nutrients hit target', () => {
    for (const s of computeBodySystems(perfect(), targets, fullMacros)) {
      expect(s.score, `${s.label} should be 100`).toBe(100);
    }
  });

  it('scores 50 at half of every target', () => {
    const half = Object.fromEntries(Object.entries(perfect()).map(([k, v]) => [k, v / 2]));
    // Macros must be halved too, or protein sits at 100% and skews the systems
    // that include it — which is exactly the coupling this argument makes explicit.
    const halfMacros = macros({
      protein: targets.protein / 2, carbs: targets.carbs / 2, fat: targets.fat / 2,
    });
    for (const s of computeBodySystems(half, targets, halfMacros)) {
      expect(s.score, `${s.label} should be 50`).toBe(50);
    }
  });

  it('keeps every score within 0..100 for hostile input', () => {
    for (const consumed of [{}, { Zinc: -999 }, { Iron: 1e9 }, { Protein: NaN }]) {
      for (const s of computeBodySystems(consumed as never, targets, macros())) {
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(Number.isNaN(s.score)).toBe(false);
      }
    }
  });

  it('moves only the systems a nutrient belongs to', () => {
    // Biotin is in Hair & Nails and nowhere else.
    const systems = computeBodySystems({ Biotin: 30 }, targets, macros());
    const hair = systems.find((s) => s.id === 'hair-nails')!;
    const bone = systems.find((s) => s.id === 'bone')!;
    expect(hair.score).toBeGreaterThan(0);
    expect(bone.score).toBe(0);
  });

  it('orders contributions weakest first so the UI leads with the gap', () => {
    const systems = computeBodySystems({ Zinc: 11, Iron: 1, Protein: 118 }, targets, macros());
    const hair = systems.find((s) => s.id === 'hair-nails')!;
    const pcts = hair.contributions.map((c) => c.pct);
    expect([...pcts].sort((a, b) => a - b)).toEqual(pcts);
  });

  it('reports gaps as the sub-50% contributors', () => {
    const hair = computeBodySystems({ Protein: 118, Zinc: 11 }, targets, macros())
      .find((s) => s.id === 'hair-nails')!;
    const gapNames = hair.gaps.map((g) => g.nutrient);
    expect(gapNames).toContain('Biotin');   // absent → 0%
    expect(gapNames).not.toContain('Zinc'); // at target → 100%
    expect(hair.gaps.every((g) => g.pct < 50)).toBe(true);
  });

  it('carries the label and blurb for display', () => {
    const skin = computeBodySystems({}, targets, macros()).find((s) => s.id === 'skin')!;
    expect(skin.label).toBe('Skin');
    expect(skin.blurb).toMatch(/collagen/i);
  });
});

// ── Regression: protein came in through the wrong door ────────────────────
// Protein lives on `food.protein` and NEVER reaches the micros map — there is
// no MICRO_KEY_MAP alias for it. Reading it from consumedMicros silently
// yielded 0, so Hair & Nails and Muscle were permanently dragged down by a
// contributor that could never move. The earlier invariant test skipped macros
// entirely, so nothing caught it.
describe('computeBodySystems — macros come from the macros argument', () => {
  const proteinSystems = BODY_SYSTEMS.filter((s) => s.nutrients.includes('Protein'));

  it('at least two systems depend on protein', () => {
    expect(proteinSystems.map((s) => s.id)).toEqual(['hair-nails', 'muscle']);
  });

  it('scores protein from the macros argument, not the micros map', () => {
    const withMacro = computeBodySystems({}, targets, macros({ protein: targets.protein }));
    for (const sys of proteinSystems) {
      const s = withMacro.find((x) => x.id === sys.id)!;
      const protein = s.contributions.find((c) => c.nutrient === 'Protein')!;
      expect(protein.pct, `${s.label} protein should be 100%`).toBe(100);
    }
  });

  it('IGNORES protein smuggled into the micros map', () => {
    // Belt and braces: the only source of truth is the macros argument.
    const viaMicros = computeBodySystems({ Protein: 118 }, targets, macros());
    const hair = viaMicros.find((s) => s.id === 'hair-nails')!;
    expect(hair.contributions.find((c) => c.nutrient === 'Protein')!.pct).toBe(0);
  });

  it('logging protein visibly raises the systems that use it', () => {
    const none = computeBodySystems({}, targets, macros());
    const full = computeBodySystems({}, targets, macros({ protein: targets.protein }));
    for (const sys of proteinSystems) {
      const before = none.find((s) => s.id === sys.id)!.score;
      const after = full.find((s) => s.id === sys.id)!.score;
      expect(after, `${sys.label} should rise when protein is logged`).toBeGreaterThan(before);
    }
  });

  it('leaves protein-free systems untouched', () => {
    const none = computeBodySystems({}, targets, macros());
    const full = computeBodySystems({}, targets, macros({ protein: targets.protein }));
    for (const sys of BODY_SYSTEMS.filter((s) => !s.nutrients.includes('Protein'))) {
      expect(full.find((s) => s.id === sys.id)!.score)
        .toBe(none.find((s) => s.id === sys.id)!.score);
    }
  });

  it('scales protein proportionally', () => {
    const half = computeBodySystems({}, targets, macros({ protein: targets.protein / 2 }));
    const muscle = half.find((s) => s.id === 'muscle')!;
    expect(muscle.contributions.find((c) => c.nutrient === 'Protein')!.pct).toBe(50);
  });

  it('survives a missing or malformed macros object', () => {
    for (const bad of [undefined, null, { protein: NaN }, { protein: '31g' }]) {
      const r = computeBodySystems({}, targets, bad as never);
      expect(r).toHaveLength(7);
      for (const s of r) expect(Number.isNaN(s.score)).toBe(false);
    }
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
