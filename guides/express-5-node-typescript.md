# Express 5 + Node.js 20 + TypeScript

## Why Express 5

- Express 5 (currently RC/stable) has **async error handling built in** — no more wrapping every async route in try/catch
- TypeScript types ship separately: `npm install express @types/express`
- API is largely the same as Express 4; most migrations are drop-in

---

## Installation

```bash
npm install express@^5
npm install -D @types/express typescript tsx
```

---

## Key Difference from Express 4: Async Error Handling

In Express 4, uncaught async errors silently hang the request:

```typescript
// Express 4 — BAD: error is swallowed
app.get('/data', async (req, res) => {
  const data = await fetchData(); // if this throws, request hangs
  res.json(data);
});

// Express 4 — required workaround
app.get('/data', async (req, res, next) => {
  try {
    const data = await fetchData();
    res.json(data);
  } catch (err) {
    next(err); // must manually forward
  }
});
```

In Express 5, async errors are automatically forwarded to error handlers:

```typescript
// Express 5 — clean
app.get('/data', async (req, res) => {
  const data = await fetchData(); // throws → caught by Express 5 automatically
  res.json(data);
});
```

---

## Config Module Pattern (Recommended)

Never access `process.env` directly in route handlers. Create a typed config module:

```typescript
// server/src/lib/config.ts
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  aisApiKey: requireEnv('AISSTREAM_API_KEY'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;
```

This throws at startup if required env vars are missing — **fail fast** instead of silently at runtime.

---

## `require.main === module` Guard (for Testability)

Separate the Express app from the server startup to make the app testable:

```typescript
// server/src/index.ts
const app = express();
// ... routes ...
export default app; // exported for tests

// Only start listening when run directly, not when imported by tests
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });
}
```

---

## TypeScript tsconfig for Node.js Server

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "node_modules"]
}
```

**Important:** Exclude test files (`*.test.ts`) from the production build tsconfig. If test files are included, `tsc` will try to resolve test dependencies (vitest, etc.) that aren't in the production bundle and fail.

---

## Dev Scripts with tsx

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## Gotchas & Platform Notes

- **Docker builds:** Ensure `exclude` in tsconfig covers all test/dev-only files. A missing exclude caused a build failure when test imports (e.g. `vitest`) weren't available in the production image.
- **`cors({ origin: '*' })` is not safe for production.** Lock it down to your frontend domain via a config value.
- **`process.env` in route handlers** is an anti-pattern — always go through a config module so env validation is centralized and happens at startup.
- **Express 5 + `@types/express`:** The types package (`@types/express`) lags slightly behind in capturing every Express 5 API change, but is sufficient for all common usage. Use `skipLibCheck: true` in tsconfig to avoid type errors from transitive deps.
