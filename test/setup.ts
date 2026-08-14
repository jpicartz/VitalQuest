// The /vitest subpath both registers the matchers AND augments vitest's
// Assertion interface, so `toBeInTheDocument()` typechecks as well as runs.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount between tests so queries can't see a previous render's DOM.
afterEach(() => cleanup());

// jsdom implements neither of these, and both are used by the app:
// Recharts' ResponsiveContainer needs ResizeObserver, and the theme init in
// App.tsx reads matchMedia('(prefers-color-scheme: dark)').
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
