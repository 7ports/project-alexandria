import { defineConfig } from 'vitest/config';

// The lib/ modules are native-backed (better-sqlite3 / sqlite-vec) and the
// embedder loads a ~130 MB ONNX model. Run everything in a single forked
// process so the model loads once, and give generous timeouts for the first
// model load + embedding calls.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    testTimeout: 120000,
    hookTimeout: 120000,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    fileParallelism: false,
  },
});
