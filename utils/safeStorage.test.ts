import { describe, it, expect, afterEach, vi } from 'vitest';
import { readItem, writeItem, removeItem } from './safeStorage';

/**
 * These guard a crash that only ever reproduced in Safari private browsing,
 * where every localStorage write throws. Nothing else in the suite would catch
 * a regression here, because jsdom's localStorage always succeeds.
 */
const stub = (impl: Partial<Storage>) => {
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', { value: impl, configurable: true });
  return () => Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true });
};

let restore: (() => void) | null = null;
afterEach(() => { restore?.(); restore = null; });

describe('writeItem', () => {
  it('returns null when the write succeeds', () => {
    const setItem = vi.fn();
    restore = stub({ setItem } as unknown as Storage);
    expect(writeItem('k', 'v')).toBeNull();
    expect(setItem).toHaveBeenCalledWith('k', 'v');
  });

  it('reports a quota failure by error name', () => {
    restore = stub({ setItem: () => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } } as unknown as Storage);
    expect(writeItem('k', 'v')).toBe('quota');
  });

  it('reports a quota failure by legacy numeric code', () => {
    // Older WebKit signals quota with code 22 and no useful name.
    restore = stub({ setItem: () => { throw Object.assign(new Error('x'), { code: 22 }); } } as unknown as Storage);
    expect(writeItem('k', 'v')).toBe('quota');
  });

  it('reports storage being unavailable, which is the Safari private-browsing case', () => {
    restore = stub({ setItem: () => { const e = new Error('denied'); e.name = 'SecurityError'; throw e; } } as unknown as Storage);
    expect(writeItem('k', 'v')).toBe('unavailable');
  });

  it('never throws, whatever the browser does', () => {
    restore = stub({ setItem: () => { throw 'not even an Error'; } } as unknown as Storage);
    expect(() => writeItem('k', 'v')).not.toThrow();
  });
});

describe('readItem', () => {
  it('returns the value when reads work', () => {
    restore = stub({ getItem: () => 'stored' } as unknown as Storage);
    expect(readItem('k')).toBe('stored');
  });

  it('returns null instead of throwing when reads are blocked', () => {
    restore = stub({ getItem: () => { throw new Error('blocked'); } } as unknown as Storage);
    expect(readItem('k')).toBeNull();
  });
});

describe('removeItem', () => {
  it('swallows a throwing remove', () => {
    restore = stub({ removeItem: () => { throw new Error('blocked'); } } as unknown as Storage);
    expect(() => removeItem('k')).not.toThrow();
  });
});
