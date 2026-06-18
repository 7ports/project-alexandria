import { defineConfig } from 'vitest/config';

// Config for running ONLY integration tests. These tests exercise the real
// pipeline and take longer due to model downloads and embedding operations.
export default defineConfig({
  test: {
    include: ['test/**/*.integration.test.js'],
    testTimeout: 180000,
    hookTimeout: 180000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
  },
});
