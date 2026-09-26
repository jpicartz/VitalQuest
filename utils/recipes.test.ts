import { describe, it, expect } from 'vitest';
import { sumIngredients, perServingOf, scaleServings } from './recipes';
import { FoodItem } from '../types';

const ing = (over: Partial<FoodItem> = {}): FoodItem => ({
  id: 'i', name: 'ingredient', calories: 0, protein: 0, carbs: 0, fat: 0, micros: {}, ...over,
});

/** A real batch: protein brownies, 12 servings. */
const brownieBatch: FoodItem[] = [
  ing({ name: 'Whey protein 200g', calories: 780, protein: 160, carbs: 12, fat: 12, micros: { Calcium: 500, Iron: 4 } }),
  ing({ name: 'Oat flour 150g',    calories: 570, protein: 20,  carbs: 100, fat: 11, micros: { Fiber: 15, Iron: 6, Magnesium: 180 } }),
  ing({ name: 'Cocoa 50g',         calories: 115, protein: 10,  carbs: 29,  fat: 7,  micros: { Fiber: 16, Iron: 7, Magnesium: 250 } }),
  ing({ name: '4 eggs',            calories: 280, protein: 24,  carbs: 2,   fat: 20, micros: { Choline: 600, 'Vitamin D': 4 } }),
];

describe('sumIngredients', () => {
  it('adds every macro across the batch', () => {
    const t = sumIngredients(brownieBatch);
    expect(t.calories).toBe(1745);   // 780+570+115+280
    expect(t.protein).toBe(214);     // 160+20+10+24
    expect(t.carbs).toBe(143);       // 12+100+29+2
    expect(t.fat).toBe(50);          // 12+11+7+20
  });

  it('sums micros by key, including ones only some ingredients have', () => {
    const t = sumIngredients(brownieBatch);
    expect(t.micros!.Iron).toBe(17);        // 4+6+7
    expect(t.micros!.Fiber).toBe(31);       // 15+16
    expect(t.micros!.Magnesium).toBe(430);  // 180+250
    expect(t.micros!.Choline).toBe(600);    // only the eggs
  });

  it('coerces the string values the model sometimes returns', () => {
    // "28g" instead of 28 is a real input here; Number("28g") is NaN and would
    // poison every total it reached.
    const t = sumIngredients([ing({ calories: '500' as never, protein: '30g' as never, micros: { Iron: '4mg' as never } })]);
    expect(t.calories).toBe(500);
    expect(t.protein).toBe(0);
    expect(t.micros!.Iron).toBe(0);
    expect(Number.isNaN(t.calories)).toBe(false);
  });

  it('handles an empty batch', () => {
    expect(sumIngredients([])).toEqual({ calories: 0, protein: 0, carbs: 0, fat: 0, micros: {} });
  });
});

describe('perServingOf', () => {
  it('divides the batch by the serving count', () => {
    const s = perServingOf(brownieBatch, 12, 'Protein brownie', 'r1');
    expect(s.calories).toBe(145.42);   // 1745/12
    expect(s.protein).toBe(17.83);     // 214/12
    expect(s.name).toBe('Protein brownie');
  });

  it('divides micros too, so the Body tab sees a real serving', () => {
    // The failure this prevents: per-serving macros but whole-batch micros,
    // which would make one brownie look like a day's iron.
    const s = perServingOf(brownieBatch, 12, 'Protein brownie', 'r1');
    expect(s.micros!.Iron).toBe(1.42);      // 17/12
    expect(s.micros!.Magnesium).toBe(35.83);// 430/12
  });

  it('a serving times the serving count returns the batch', () => {
    const s = perServingOf(brownieBatch, 12, 'x', 'r1');
    const back = scaleServings(s, 12, 'l1');
    expect(back.calories).toBeCloseTo(1745, 0);
    expect(back.micros!.Iron).toBeCloseTo(17, 1);
  });

  it('treats zero servings as one rather than producing Infinity', () => {
    const s = perServingOf(brownieBatch, 0, 'x', 'r1');
    expect(Number.isFinite(s.calories)).toBe(true);
    expect(s.calories).toBe(1745);
  });

  it('treats a negative or non-numeric serving count as one', () => {
    expect(perServingOf(brownieBatch, -4, 'x', 'r1').calories).toBe(1745);
    expect(perServingOf(brownieBatch, NaN, 'x', 'r1').calories).toBe(1745);
  });
});

describe('scaleServings', () => {
  const one = perServingOf(brownieBatch, 12, 'Protein brownie', 'r1');

  it('multiplies a serving by how many were eaten', () => {
    const two = scaleServings(one, 2, 'l1');
    expect(two.calories).toBe(290.84);
    expect(two.micros!.Iron).toBe(2.84);
  });

  it('labels the serving size so the log reads honestly', () => {
    expect(scaleServings(one, 1, 'l1').servingSize).toBe('1 serving');
    expect(scaleServings(one, 3, 'l2').servingSize).toBe('3 servings');
  });

  it('supports a half serving', () => {
    expect(scaleServings(one, 0.5, 'l1').calories).toBe(72.71);
  });

  it('falls back to one serving rather than zeroing the log', () => {
    expect(scaleServings(one, 0, 'l1').calories).toBe(one.calories);
  });
});
