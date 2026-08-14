import path from 'path';
// from 'vitest/config' rather than 'vite' so the `test` block is typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    }
  },
  test: {
    // Two projects rather than one environment: the pure-logic suite is the bulk
    // of the tests and runs far faster in node, while component tests need a DOM.
    // Splitting by file extension means a new .test.tsx gets jsdom automatically —
    // no per-file `@vitest-environment` docblock to forget.
    // (`environmentMatchGlobs` did this in Vitest 3; it was removed in v4.)
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['node_modules/**', 'dist/**'],
          // dateUtils is deliberately local-time (it avoids toISOString() UTC
          // shifts), so TZ must be pinned or the date tests are non-deterministic.
          env: { TZ: 'UTC' },
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['**/*.test.tsx'],
          exclude: ['node_modules/**', 'dist/**'],
          setupFiles: ['./test/setup.ts'],
          env: { TZ: 'UTC' },
        },
      },
    ],
  },
});
