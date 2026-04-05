# Vitest

Fast unit/integration test runner built on Vite. Native TypeScript support, compatible with Jest API.

## Install

```bash
npm install --save-dev vitest
# With @types/node if needed for Node.js globals
npm install --save-dev @types/node
```

## Config (`vitest.config.ts`)

Minimal config for a Node.js backend:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

For frontend projects use `environment: 'jsdom'` instead.

## package.json script

```json
"scripts": {
  "test": "vitest run"
}
```

Use `vitest` (without `run`) for watch mode during development.

## Mocking modules with `vi.mock()`

```typescript
import { vi } from 'vitest'

// Mock an entire module — factory runs before imports are resolved
vi.mock('../lib/aisProxy', () => ({
  aisProxy: {
    connect: vi.fn(),
    getLatestPositions: vi.fn(() => new Map()),
    onPosition: vi.fn(() => () => {}),
  },
}))
```

Key rules:
- `vi.mock()` calls are hoisted to the top of the file automatically — you can write them anywhere but they always run first.
- The factory function must return an object matching the module's exports.
- For named exports wrap in the returned object; for default exports use a `default` key.

## Mocking globals (`vi.stubGlobal`)

```typescript
// Mock global fetch
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ features: [] }),
}))

// Restore in afterEach
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
```

## Spying on built-ins

```typescript
// Freeze Date.now to a specific value (useful for cache TTL tests)
vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10 * 60 * 1000)
```

## Top-level await in test files

Vitest supports top-level `await` in test files for dynamic imports after mocks are set up:

```typescript
vi.mock('../lib/aisProxy', () => ({ ... }))

process.env['REQUIRED_VAR'] = 'test-value'

// Import AFTER mocks and env vars are ready
const { default: app } = await import('../index')
```

This is the correct pattern when the module under test reads `process.env` at load time or starts side effects on import.

## Running in CI

```bash
npx vitest run          # single run, exits with code 1 on failure
npx vitest run --reporter=verbose  # verbose output
```

No extra config needed — vitest exits non-zero on test failure, which CI picks up automatically.

## Gotchas

- **Module-level state persists across tests** — if a module has a cache variable (e.g., `let cache = null`), it accumulates across tests in the same run. Use `vi.spyOn(Date, 'now')` to simulate time passage for TTL-based caches rather than trying to reset the variable.
- **`vi.restoreAllMocks()` only restores spies**, not `vi.stubGlobal` — call `vi.unstubAllGlobals()` separately.
- **`vi.mock()` hoisting** — the mock factory cannot reference variables from the outer scope (they haven't been initialised yet at hoist time). Use `vi.fn()` inline.
- **TypeScript + ESM**: if your `tsconfig.json` uses `"module": "CommonJS"`, vitest handles the transform; no extra config needed beyond `vitest.config.ts`.
