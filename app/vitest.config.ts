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
  },
});
