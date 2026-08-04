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
    // Pure-logic suite: every target runs in node, so no jsdom is needed.
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    // dateUtils is deliberately local-time (it avoids toISOString() UTC shifts),
    // so the timezone must be pinned or the date tests are non-deterministic.
    env: { TZ: 'UTC' },
  },
});
