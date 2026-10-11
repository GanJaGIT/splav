import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('test'),
    __DEV_HOOKS__: JSON.stringify(true),
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/levels/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/sim/**/*.ts'],
      reporter: ['text'],
      // Stage 1 acceptance: at least 90% of src/sim lines are covered.
      thresholds: { lines: 90 },
    },
  },
});
