import { describe, it, expect } from 'vitest';
import {
  kgToLbs, lbsToKg, toDisplayWeight, fromDisplayWeight,
  formatWeight, formatWeightDelta, weightBounds, LBS_PER_KG,
} from './units';

/**
 * kg is the only stored unit. These guard the two edges where that could be
 * violated: parsing input and formatting output.
 */
describe('conversion', () => {
  it('round-trips a value through lbs without drift', () => {
    // The failure this prevents: a user in lbs re-saving their goal and
    // watching the target creep by a tenth each time.
    const kg = 82.4;
    expect(lbsToKg(kgToLbs(kg))).toBeCloseTo(kg, 10);
  });

  it('uses the standard factor', () => {
    expect(kgToLbs(1)).toBeCloseTo(LBS_PER_KG, 10);
    expect(kgToLbs(100)).toBeCloseTo(220.462, 3);
  });

  it('is identity for kg', () => {
    expect(toDisplayWeight(74.25, 'kg')).toBe(74.3);
    expect(fromDisplayWeight(74.2, 'kg')).toBe(74.2);
  });
});

describe('display', () => {
  it('formats a weight with its unit', () => {
    expect(formatWeight(74.2, 'kg')).toBe('74.2 kg');
    expect(formatWeight(74.2, 'lbs')).toBe('163.6 lbs');
  });

  it('formats a delta by magnitude, so callers control the wording', () => {
    // A delta must scale, never take an offset. -2 kg is 4.4 lbs of change,
    // not "the weight 4.4 lbs".
    expect(formatWeightDelta(-2, 'kg')).toBe('2 kg');
    expect(formatWeightDelta(-2, 'lbs')).toBe('4.4 lbs');
  });

  it('rounds to one decimal in both units', () => {
    expect(toDisplayWeight(74.26, 'kg')).toBe(74.3);
    expect(toDisplayWeight(80, 'lbs')).toBe(176.4);
  });
});

describe('input bounds', () => {
  it('derives lbs bounds from the kg ones rather than hardcoding', () => {
    expect(weightBounds('kg')).toEqual({ min: 20, max: 400 });
    const lbs = weightBounds('lbs');
    expect(lbs.min).toBe(44);
    expect(lbs.max).toBe(882);
  });

  it('accepts a realistic weight in either unit', () => {
    for (const unit of ['kg', 'lbs'] as const) {
      const { min, max } = weightBounds(unit);
      const typical = toDisplayWeight(80, unit);
      expect(typical).toBeGreaterThan(min);
      expect(typical).toBeLessThan(max);
    }
  });
});
