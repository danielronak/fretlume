import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { alias } from './vite.config.ts';

export default defineConfig({
  resolve: { alias },
  plugins: [react()],
  test: {
    // Node by default; component tests opt in with `// @vitest-environment happy-dom`.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // The pure logic in core/ carries the phase-1 gate: at least 95 % of lines covered.
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/*.test.ts'],
      reporter: ['text-summary'],
      thresholds: { lines: 95 },
    },
  },
});
