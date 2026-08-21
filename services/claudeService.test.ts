import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseJsonResponse, normalizeMicros, MICRO_KEY_MAP, scaleParsedFood, generateNutritionInsights } from './claudeService';
import { aProfile, aPlan } from '../test/fixtures';
import { buildInsightsPayload } from '../utils/nutritionAggregates';
import { NUTRIENT_INFO } from '../data/nutrientData';
import { PRIORITY_MICROS } from '../utils/nutritionAggregates';

describe('parseJsonResponse — happy path', () => {
  it('parses plain JSON', () => {
    expect(parseJsonResponse('{"a":1}')).toEqual({ a: 1 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseJsonResponse('  \n {"a":1} \n ')).toEqual({ a: 1 });
  });

  it('strips a ```json fenced block', () => {
    expect(parseJsonResponse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('strips a bare ``` fenced block', () => {
    expect(parseJsonResponse('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recovers from an uppercase ```JSON fence via the regex fallback', () => {
    // The fence regex is case-sensitive, so this survives by a different path.
    expect(parseJsonResponse('```JSON\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('extracts JSON wrapped in prose', () => {
    expect(parseJsonResponse('Here is your plan:\n{"a":1}\nHope that helps!')).toEqual({ a: 1 });
  });

  it('parses nested objects and arrays', () => {
    const raw = '{"foods":[{"name":"Egg","micros":{"Fiber":0}}]}';
    expect(parseJsonResponse(raw)).toEqual({ foods: [{ name: 'Egg', micros: { Fiber: 0 } }] });
  });
});

describe('parseJsonResponse — control characters', () => {
  it('rescues a raw newline inside a string value', () => {
    // A literal newline inside a JSON string is illegal and is a common LLM
    // failure; the control-char scrub replaces it with a space. This is the
    // single most valuable thing that scrub does.
    const raw = '{"summary":"line one\nline two"}';
    expect(() => JSON.parse(raw)).toThrow();           // illegal as-is
    expect(parseJsonResponse(raw)).toEqual({ summary: 'line one line two' });
  });

  it('rescues a raw tab inside a string value', () => {
    expect(parseJsonResponse('{"a":"x\ty"}')).toEqual({ a: 'x y' });
  });

  it('preserves an escaped \\n (two characters, not a control char)', () => {
    expect(parseJsonResponse('{"a":"line1\\nline2"}')).toEqual({ a: 'line1\nline2' });
  });
});

describe('parseJsonResponse — failure modes', () => {
  it('throws a clear error when there is no JSON object at all', () => {
    expect(() => parseJsonResponse('I cannot help with that.')).toThrow('No valid JSON found in response');
  });

  it('throws on an empty string', () => {
    expect(() => parseJsonResponse('')).toThrow('No valid JSON found in response');
  });

  it('throws a SyntaxError when a brace-delimited span is unparseable', () => {
    // Documents a known limitation: the fallback regex is greedy, spanning the
    // FIRST { to the LAST }, so two separate objects are captured together and
    // JSON.parse throws an uncaught SyntaxError rather than the friendly error.
    expect(() => parseJsonResponse('first {"a":1} then {"b":2}')).toThrow(SyntaxError);
  });

  it('parses a top-level array normally', () => {
    // A bare array is valid JSON, so the first parse succeeds and the greedy
    // fallback is never reached. Callers still expect an object, but that is
    // their shape check to make, not this function's.
    expect(parseJsonResponse('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('DOES hit the greedy-regex limitation when an array is wrapped in prose', () => {
    // Here the first parse fails, the fallback spans the first { to the last },
    // and `{"a":1},{"b":2}` is not parseable.
    expect(() => parseJsonResponse('Here you go: [{"a":1},{"b":2}]')).toThrow(SyntaxError);
  });
});

describe('normalizeMicros', () => {
  it('maps snake_case aliases to canonical Title Case', () => {
    expect(normalizeMicros({ vitamin_c: 90, vitamin_b12: 2.4 })).toEqual({
      'Vitamin C': 90,
      'Vitamin B12': 2.4,
    });
  });

  it('maps lowercase spaced aliases', () => {
    expect(normalizeMicros({ 'vitamin d': 20, 'omega 3': 1.6 })).toEqual({
      'Vitamin D': 20,
      'Omega-3': 1.6,
    });
  });

  it('maps scientific synonyms', () => {
    expect(normalizeMicros({ 'ascorbic acid': 90, thiamine: 1.2, cobalamin: 2.4 })).toEqual({
      'Vitamin C': 90,
      Thiamin: 1.2,
      'Vitamin B12': 2.4,
    });
  });

  it('is case-insensitive on input keys', () => {
    expect(normalizeMicros({ 'VITAMIN C': 90, FiBeR: 28 })).toEqual({ 'Vitamin C': 90, Fiber: 28 });
  });

  it('passes canonical keys through unchanged', () => {
    expect(normalizeMicros({ 'Vitamin C': 90, Fiber: 28 })).toEqual({ 'Vitamin C': 90, Fiber: 28 });
  });

  it('passes unknown keys through rather than dropping them', () => {
    expect(normalizeMicros({ Unobtainium: 5 })).toEqual({ Unobtainium: 5 });
  });

  it.each([
    ['28g', 0],
    ['', 0],
    [null, 0],
    [undefined, 0],
    ['abc', 0],
    ['28', 28],
    [28.5, 28.5],
  ])('coerces %o to %o without producing NaN', (input, expected) => {
    const result = normalizeMicros({ Fiber: input });
    expect(result.Fiber).toBe(expected);
    expect(Number.isNaN(result.Fiber)).toBe(false);
  });

  it('returns an empty object for empty input', () => {
    expect(normalizeMicros({})).toEqual({});
  });
});

describe('scaleParsedFood', () => {
  // The bug this exists to prevent: the model was returning per-100g USDA
  // figures while labelling the serving "5 eggs (250g)", so five eggs logged as
  // 155 kcal and 27.5 mcg biotin instead of ~390 kcal and ~50 mcg. Telling the
  // model to multiply instead produced a 4x OVER-count. The arithmetic belongs
  // in code.
  const egg = {
    name: 'Egg',
    unit: '1 large egg (50g)',
    quantity: 5,
    perUnit: {
      calories: 78, protein: 6.3, carbs: 0.6, fat: 5.3,
      micros: { Biotin: 10, Choline: 147, Selenium: 15.4 },
    },
  };

  it('multiplies every field by quantity', () => {
    const f = scaleParsedFood(egg, 'id-1');
    expect(f.calories).toBe(390);
    expect(f.protein).toBe(31.5);
    expect(f.fat).toBe(26.5);
  });

  it('multiplies micronutrients too, not just macros', () => {
    const f = scaleParsedFood(egg, 'id-1');
    expect(f.micros!.Biotin).toBe(50);      // 10 x 5 — now exceeds the 30 target
    expect(f.micros!.Choline).toBe(735);
  });

  it('labels the serving with the quantity', () => {
    expect(scaleParsedFood(egg, 'id-1').servingSize).toBe('5 × 1 large egg (50g)');
  });

  it('does not prefix the label when quantity is 1', () => {
    const f = scaleParsedFood({ ...egg, quantity: 1 }, 'id-1');
    expect(f.servingSize).toBe('1 large egg (50g)');
    expect(f.calories).toBe(78);
  });

  it('handles fractional quantities', () => {
    const f = scaleParsedFood({ ...egg, quantity: 0.5 }, 'id-1');
    expect(f.calories).toBe(39);
    expect(f.micros!.Biotin).toBe(5);
  });

  it.each([undefined, null, 0, -3, 'abc', NaN])(
    'falls back to quantity 1 for %o', (q) => {
      const f = scaleParsedFood({ ...egg, quantity: q as never }, 'id-1');
      expect(f.calories).toBe(78);
      expect(Number.isNaN(f.calories)).toBe(false);
    }
  );

  it('normalises micro key aliases before scaling', () => {
    const f = scaleParsedFood({
      name: 'Test', unit: '1 serving', quantity: 2,
      perUnit: { calories: 10, micros: { vitamin_c: 45, 'omega 3': 0.4 } },
    }, 'id-1');
    expect(f.micros!['Vitamin C']).toBe(90);
    expect(f.micros!['Omega-3']).toBe(0.8);
  });

  it('coerces unparseable values to 0 rather than NaN', () => {
    const f = scaleParsedFood({
      name: 'Test', unit: '1 serving', quantity: 3,
      perUnit: { calories: '78 kcal', protein: null, micros: { Biotin: '10mcg' } },
    } as never, 'id-1');
    expect(f.calories).toBe(0);
    expect(f.protein).toBe(0);
    expect(f.micros!.Biotin).toBe(0);
    expect(Number.isNaN(f.calories)).toBe(false);
  });

  it('accepts the legacy totals shape without double-scaling', () => {
    // A model that ignores the per-unit schema and returns totals directly must
    // not then be multiplied again.
    const f = scaleParsedFood({
      name: 'Egg', servingSize: '5 eggs', quantity: 5,
      calories: 390, protein: 31.5, micros: { Biotin: 50 },
    } as never, 'id-1');
    expect(f.calories).toBe(390);
    expect(f.micros!.Biotin).toBe(50);
    expect(f.servingSize).toBe('5 eggs');
  });

  it('survives a food with no micros at all', () => {
    const f = scaleParsedFood({ name: 'Water', unit: '1 glass', quantity: 2, perUnit: { calories: 0 } }, 'id-1');
    expect(f.calories).toBe(0);
    expect(f.micros).toEqual({});
  });

  it('rounds to 2dp so trace nutrients survive without float noise', () => {
    const f = scaleParsedFood({
      name: 'Test', unit: '1 serving', quantity: 3,
      perUnit: { calories: 0, micros: { Iodine: 0.1 } },
    }, 'id-1');
    expect(f.micros!.Iodine).toBe(0.3);
  });
});

describe('key-map invariants', () => {
  it('every alias resolves to a nutrient that actually exists', () => {
    // Guards against a typo'd canonical name silently producing a key that
    // NUTRIENT_INFO cannot render and computeMicroScore will never count.
    for (const [alias, canonical] of Object.entries(MICRO_KEY_MAP)) {
      expect(NUTRIENT_INFO[canonical], `"${alias}" → "${canonical}" is not in NUTRIENT_INFO`).toBeDefined();
    }
  });

  it('every priority micronutrient is reachable as a canonical target', () => {
    const targets = new Set(Object.values(MICRO_KEY_MAP));
    for (const key of PRIORITY_MICROS) {
      expect(targets.has(key), `"${key}" is scored but no alias maps to it`).toBe(true);
    }
  });

  it('all alias keys are lowercase, since lookup lowercases the input', () => {
    for (const alias of Object.keys(MICRO_KEY_MAP)) {
      expect(alias, `"${alias}" is unreachable because lookup lowercases first`).toBe(alias.toLowerCase());
    }
  });
});

describe('generateNutritionInsights — hostile model output', () => {
  // The component maps over patterns/insights/recommendations. A model that
  // returns a string (or an object) where an array belongs used to pass the
  // `|| []` check and then throw inside the render.
  const payload = buildInsightsPayload(
    [{ date: '2026-08-20', calories: 2000, protein: 100, carbs: 200, fat: 60, mealCount: 3, micros: {} }] as never,
    2654,
    118,
  );

  const withResponse = (text: string) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: 'text', text }] }),
    }));
  };

  afterEach(() => { vi.unstubAllGlobals(); });

  it('coerces a string where an array belongs into an empty array', async () => {
    withResponse(JSON.stringify({
      headline: 'ok', patterns: 'not an array',
      insights: [], recommendations: [], encouragement: 'x',
    }));
    const out = await generateNutritionInsights(payload, aProfile(), aPlan());
    expect(Array.isArray(out.patterns)).toBe(true);
    expect(out.patterns).toEqual([]);
  });

  it('drops non-string entries rather than rendering [object Object]', async () => {
    withResponse(JSON.stringify({
      headline: 'ok', patterns: ['real', { nested: 'object' }, 42, null],
      insights: [], recommendations: [], encouragement: 'x',
    }));
    const out = await generateNutritionInsights(payload, aProfile(), aPlan());
    expect(out.patterns).toEqual(['real']);
  });
});
