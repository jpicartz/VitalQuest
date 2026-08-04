import { describe, it, expect } from 'vitest';
import { parseJsonResponse, normalizeMicros, MICRO_KEY_MAP } from './claudeService';
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
