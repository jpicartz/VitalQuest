import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseJsonResponse, normalizeMicros, MICRO_KEY_MAP, scaleParsedFood, generateNutritionInsights, estimateItemCount, parseFoodLog, MICRO_SKELETON, UNIT_DECLARATION } from './claudeService';
import { aProfile, aPlan } from '../test/fixtures';
import { buildInsightsPayload } from '../utils/nutritionAggregates';
import { MICRO_KEYS, NUTRIENT_INFO } from '../data/nutrientData';
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
  // normalizeMicros now returns ALL 28 tracked keys, filling anything the model
  // did not report with 0, so these assert the aliasing on top of that baseline
  // rather than an exact object. The fill is the point: an absent key used to
  // propagate as `undefined` into every total that read it.
  const resolved = (raw: Record<string, unknown>) => {
    const out = normalizeMicros(raw);
    // Only the keys that came back non-zero, i.e. what the aliasing resolved to.
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== 0));
  };

  it('maps snake_case aliases to canonical Title Case', () => {
    expect(resolved({ vitamin_c: 90, vitamin_b12: 2.4 })).toEqual({
      'Vitamin C': 90,
      'Vitamin B12': 2.4,
    });
  });

  it('maps lowercase spaced aliases', () => {
    expect(resolved({ 'vitamin d': 20, 'omega 3': 1.6 })).toEqual({
      'Vitamin D': 20,
      'Omega-3': 1.6,
    });
  });

  it('maps scientific synonyms', () => {
    expect(resolved({ 'ascorbic acid': 90, thiamine: 1.2, cobalamin: 2.4 })).toEqual({
      'Vitamin C': 90,
      Thiamin: 1.2,
      'Vitamin B12': 2.4,
    });
  });

  it('is case-insensitive on input keys', () => {
    expect(resolved({ 'VITAMIN C': 90, FiBeR: 28 })).toEqual({ 'Vitamin C': 90, Fiber: 28 });
  });

  it('passes canonical keys through unchanged', () => {
    expect(resolved({ 'Vitamin C': 90, Fiber: 28 })).toEqual({ 'Vitamin C': 90, Fiber: 28 });
  });

  it('passes unknown keys through rather than dropping them', () => {
    expect(resolved({ Unobtainium: 5 })).toEqual({ Unobtainium: 5 });
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

  it('returns every tracked nutrient at 0 for empty input, not an empty object', () => {
    // A food the model reported no micros for still has all 28 keys, so nothing
    // downstream has to guard against a missing one.
    const out = normalizeMicros({});
    expect(Object.keys(out).sort()).toEqual([...MICRO_KEYS].sort());
    expect(Object.values(out).every(v => v === 0)).toBe(true);
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
    // Every tracked nutrient at 0, not an empty map: water really does contain
    // none of them, and a complete shape means no reader has to guard.
    expect(Object.keys(f.micros!).sort()).toEqual([...MICRO_KEYS].sort());
    expect(Object.values(f.micros!).every(v => v === 0)).toBe(true);
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

describe('parseJsonResponse — structurally broken documents', () => {
  // All of these come from one real failure: a seven-ingredient recipe that
  // came back with every ingredient and value intact but 22 opening braces to
  // 20 closing ones — the array was closed before two objects inside it were.
  // The user saw "Could not reach the nutrition service".

  it('recovers when the array closes before the objects inside it', () => {
    // The exact shape of the real break: last food never closed, yet ] and
    // the root brace still arrived.
    const broken = '{"foods":[{"name":"Egg","perUnit":{"calories":70}},{"name":"Salt","perUnit":{"calories":0]';
    const out = parseJsonResponse(broken);
    expect(out.foods).toHaveLength(2);
    expect(out.foods[1].name).toBe('Salt');
    expect(out.foods[1].perUnit.calories).toBe(0);
  });

  it('keeps every ingredient rather than dropping the tail', () => {
    // The greedy-regex fallback would cut at the last brace and lose foods.
    const broken = '{"foods":[{"name":"A"},{"name":"B"},{"name":"C"}';
    expect(parseJsonResponse(broken).foods.map((f: { name: string }) => f.name))
      .toEqual(['A', 'B', 'C']);
  });

  it('closes a missing root brace', () => {
    const out = parseJsonResponse('{"foods":[{"name":"Egg","perUnit":{"calories":70}}]');
    expect(out.foods).toHaveLength(1);
  });

  it('closes several levels at once', () => {
    expect(parseJsonResponse('{"foods":[{"name":"Egg","perUnit":{"calories":70').foods[0].perUnit.calories).toBe(70);
  });

  it('does not count braces inside a string', () => {
    const out = parseJsonResponse('{"foods":[{"name":"Rice {jasmine}","perUnit":{"calories":200}}]');
    expect(out.foods[0].name).toBe('Rice {jasmine}');
  });

  it('handles an escaped quote before the break', () => {
    const out = parseJsonResponse('{"foods":[{"name":"6\\" sub","perUnit":{"calories":300}}]');
    expect(out.foods[0].name).toBe('6" sub');
  });

  it('leaves well-formed JSON untouched', () => {
    expect(parseJsonResponse('{"a":1,"b":[2,3]}')).toEqual({ a: 1, b: [2, 3] });
  });

  it('still rejects something that is not JSON at all', () => {
    expect(() => parseJsonResponse('the model apologised instead')).toThrow(/No valid JSON/);
  });
});

describe('the parse prompt and the nutrient reference data cannot disagree', () => {
  const source = readFileSync(new URL('./claudeService.ts', import.meta.url), 'utf8');
  const parseFn = source.slice(
    source.indexOf('export const parseFoodLog'),
    source.indexOf('const raw = await callClaude', source.indexOf('export const parseFoodLog')),
  );

  it('tracks 28 micronutrients, all of them scoreable', () => {
    expect(MICRO_KEYS).toHaveLength(28);
    for (const k of MICRO_KEYS) {
      expect(NUTRIENT_INFO[k], `${k} has no NUTRIENT_INFO entry`).toBeDefined();
      expect(NUTRIENT_INFO[k].unit, `${k} has no unit`).toBeTruthy();
      expect(NUTRIENT_INFO[k].targetVal, `${k} has no target, so it can never score`).toBeGreaterThan(0);
    }
  });

  it('excludes the three macro keys, which are never in a micros map', () => {
    for (const macro of ['Protein', 'Carbohydrates', 'Fats']) {
      expect(NUTRIENT_INFO[macro], `${macro} should still be in NUTRIENT_INFO`).toBeDefined();
      expect(MICRO_KEYS).not.toContain(macro);
    }
  });

  it('asks the model for exactly the keys the app scores', () => {
    const asked = [...MICRO_SKELETON.matchAll(/"([^"]+)":0/g)].map(m => m[1]);
    expect(asked).toEqual(MICRO_KEYS);
  });

  it('declares every nutrient in the unit the app scores it in, exactly once', () => {
    // The bug this makes impossible: Copper was scored in mcg against a 900
    // target while the prompt asked for mg, so a real 0.9 mg read as 0.1% DV —
    // a 1000x under-report that looked like a plausible small number.
    const declared = new Map<string, string>();
    for (const clause of UNIT_DECLARATION.split(';')) {
      const m = clause.match(/^\s*(.+?)\s+in\s+(\S+)\s*$/);
      expect(m, `unparseable unit clause: "${clause}"`).not.toBeNull();
      for (const key of m![1].split(',')) {
        const k = key.trim();
        expect(declared.has(k), `${k} is declared twice`).toBe(false);
        declared.set(k, m![2]);
      }
    }
    expect([...declared.keys()].sort()).toEqual([...MICRO_KEYS].sort());
    for (const k of MICRO_KEYS) {
      expect(declared.get(k), `${k}: prompt and NUTRIENT_INFO disagree`).toBe(NUTRIENT_INFO[k].unit);
    }
  });

  it('builds the prompt from the constants rather than a hand-written copy', () => {
    // A literal key list in the prompt is how the Copper drift happened. If
    // someone inlines one again, this fails.
    expect(parseFn).toContain('${MICRO_SKELETON}');
    expect(parseFn).toContain('${UNIT_DECLARATION}');
    const inlined = [...parseFn.matchAll(/"(Vitamin [A-Z0-9]+|Biotin|Copper|Selenium|Iodine)":0/g)];
    expect(inlined.map(m => m[1]), 'nutrient keys were inlined into the prompt').toEqual([]);
  });

  it('never tells the model to omit a nutrient', () => {
    // Asking for omission of "zero" values made the model drop real ones —
    // eggs came back with no Biotin at all, which the app reads as none.
    expect(parseFn).not.toMatch(/OMIT any micronutrient/i);
    expect(parseFn).toMatch(/INCLUDE EVERY MICRONUTRIENT KEY/i);
  });
});

describe('estimateItemCount sizes the output budget', () => {
  const budget = (input: string) =>
    Math.min(4096, Math.max(1600, 600 + estimateItemCount(input) * 350));

  it('counts the separators people type, not just newlines', () => {
    // The regression: this is one line and seven foods. Counting lines gave it
    // the floor, the response hit max_tokens, and the whole parse was lost.
    const oneLine =
      '3 scrambled eggs with 30g cheddar, 2 slices wholemeal toast with butter, a banana, and 200g greek yogurt with honey';
    expect(estimateItemCount(oneLine)).toBeGreaterThanOrEqual(6);
    expect(budget(oneLine)).toBeGreaterThan(2500);
  });

  it('counts newline-separated items', () => {
    expect(estimateItemCount('oatmeal\nbanana\ncoffee')).toBe(3);
  });

  it('never returns less than one, whatever the input', () => {
    for (const junk of ['', '   ', ',,,', '\n\n', 'a']) {
      expect(estimateItemCount(junk)).toBe(1);
      expect(budget(junk)).toBe(1600);
    }
  });

  it('stays within the proxy output cap however long the input', () => {
    expect(budget(Array(200).fill('egg').join(', '))).toBe(4096);
  });
});

describe('parseFoodLog guarantees a complete nutrient shape', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  /** A perUnit food reporting only the first `n` of the 28 tracked micros. */
  const foodWith = (n: number) => ({
    name: 'Egg', unit: '1 large egg (50g)', quantity: 2,
    perUnit: {
      calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8,
      micros: Object.fromEntries(MICRO_KEYS.slice(0, n).map((k, i) => [k, i + 1])),
    },
  });

  /** Queues one response per call, so a retry gets the next one. */
  const withResponses = (...payloads: unknown[]) => {
    const fetchMock = vi.fn();
    for (const p of payloads) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: JSON.stringify(p) }], stop_reason: 'end_turn' }),
      });
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  it('fills every tracked micronutrient even when the model omits most of them', async () => {
    withResponses({ foods: [foodWith(28)] });
    const [food] = await parseFoodLog('2 eggs');
    expect(Object.keys(food.micros!).sort()).toEqual([...MICRO_KEYS].sort());
  });

  it('a key the model omitted reads as 0, never undefined or NaN', async () => {
    // Biotin is deliberately outside the first 10 keys: this is the shape of
    // the original bug, where an omitted Biotin became an absent key and every
    // total downstream silently skipped it.
    withResponses({ foods: [foodWith(10)] }, { foods: [foodWith(10)] });
    const [food] = await parseFoodLog('2 eggs');
    expect(food.micros!.Biotin).toBe(0);
    for (const k of MICRO_KEYS) {
      expect(food.micros![k], `${k} is not a finite number`).toEqual(expect.any(Number));
      expect(Number.isFinite(food.micros![k])).toBe(true);
    }
  });

  it('retries once when the response is materially incomplete', async () => {
    const fetchMock = withResponses({ foods: [foodWith(8)] }, { foods: [foodWith(28)] });
    const [food] = await parseFoodLog('2 eggs');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The complete retry won, so a real value survives where the first attempt
    // had nothing.
    expect(food.micros!.Iodine).toBeGreaterThan(0);
  });

  it('does not retry when the response is complete — a retry costs money', async () => {
    const fetchMock = withResponses({ foods: [foodWith(28)] });
    await parseFoodLog('2 eggs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry over a couple of missing trace values', async () => {
    const fetchMock = withResponses({ foods: [foodWith(26)] });
    await parseFoodLog('2 eggs');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the first attempt when the retry comes back worse', async () => {
    const fetchMock = withResponses({ foods: [foodWith(15)] }, { foods: [foodWith(4)] });
    const [food] = await parseFoodLog('2 eggs');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Key 15 was present in attempt one and absent in the worse retry.
    expect(food.micros![MICRO_KEYS[14]]).toBeGreaterThan(0);
  });

  it('scales the per-unit values by quantity', async () => {
    withResponses({ foods: [foodWith(28)] });
    const [food] = await parseFoodLog('2 eggs');
    expect(food.calories).toBe(144);          // 72 x 2
    expect(food.protein).toBe(12.6);          // 6.3 x 2
    expect(food.micros![MICRO_KEYS[0]]).toBe(2); // 1 x 2
  });
});

describe('parseFoodLog survives a transient bad response', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  const complete = {
    foods: [{
      name: 'Almonds', unit: '100g', quantity: 1,
      perUnit: {
        calories: 579, protein: 21, carbs: 22, fat: 50,
        micros: Object.fromEntries(MICRO_KEYS.map((k, i) => [k, i + 1])),
      },
    }],
  };

  /** Each entry is one call's raw text; non-JSON stands in for a bad response. */
  const withRawResponses = (...texts: string[]) => {
    const fetchMock = vi.fn();
    for (const text of texts) {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ type: 'text', text }], stop_reason: 'end_turn' }),
      });
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  // A real malformed body seen from the model: an unquoted property name.
  const MALFORMED = '{"foods":[{"name":"Salmon",unit:"1 fillet","quantity":1}]}';

  it('retries once when the first response will not parse', async () => {
    const fetchMock = withRawResponses(MALFORMED, JSON.stringify(complete));
    const foods = await parseFoodLog('100g almonds');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(foods[0].name).toBe('Almonds');
  });

  it('throws a readable message when both attempts are unparseable', async () => {
    withRawResponses(MALFORMED, MALFORMED);
    // Not "Expected double-quoted property name in JSON at position 550".
    await expect(parseFoodLog('100g almonds')).rejects.toThrow(/unreadable, twice/);
  });

  it('keeps a usable first attempt when the retry fails', async () => {
    // First attempt parses but is thin, triggering the completeness retry;
    // the retry then fails. The thin-but-real data must survive.
    const thin = {
      foods: [{
        name: 'Almonds', unit: '100g', quantity: 1,
        perUnit: { calories: 579, protein: 21, carbs: 22, fat: 50, micros: { Biotin: 45 } },
      }],
    };
    const fetchMock = withRawResponses(JSON.stringify(thin), MALFORMED);
    const foods = await parseFoodLog('100g almonds');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(foods[0].micros!.Biotin).toBe(45);
  });
});

describe('the prompt does not send the model to USDA for nutrients USDA lacks', () => {
  const source = readFileSync(new URL('./claudeService.ts', import.meta.url), 'utf8');

  it('names Biotin and Iodine as gaps instead of asking for a USDA estimate', () => {
    // "Estimate from USDA" plus "use 0 only when the food genuinely contains
    // none" made the model return Biotin 0 for almonds - one of the richest
    // biotin foods there is - because USDA's tables carry no biotin figure.
    expect(source).toMatch(/do NOT contain Biotin or Iodine/i);
    expect(source).toMatch(/almonds ~45mcg/);
  });

  it('still points at USDA for everything else', () => {
    expect(source).toMatch(/For every other nutrient, estimate from USDA/i);
  });
});
