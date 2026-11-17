import { defineConfig } from 'vitest/config';
import { alias } from './vite.config.ts';

/** Vision and audio benchmarks: `npm run bench:vision`. Slow; not part of `npm run test`. */
export default defineConfig({
  resolve: { alias },
  test: {
    environment: 'node',
    include: ['bench/**/*.bench.test.ts'],
    testTimeout: 60 * 60 * 1000,
    hookTimeout: 60 * 60 * 1000,
    pool: 'forks',
  },
});
