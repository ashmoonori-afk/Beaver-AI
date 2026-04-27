import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 60_000,
    // Webapp tests need jsdom; everything else stays in 'node'.
    environmentMatchGlobs: [['packages/webapp/**', 'jsdom']],
  },
});
