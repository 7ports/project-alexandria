# Supertest

HTTP integration testing library for Node.js. Works with any `http.Server` or Express/Koa/Fastify app.

## Install

```bash
npm install --save-dev supertest @types/supertest
```

## Basic usage with Express

```typescript
import request from 'supertest'
import app from '../src/index'   // import the Express app (not the server)

describe('GET /api/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})
```

Supertest binds the app to an ephemeral port internally — no `app.listen()` needed.

## Prerequisites — export `app` separately from `listen()`

For testability, `index.ts` must export `app` **before** calling `.listen()`:

```typescript
const app = express()
// ... middleware, routes ...

export default app   // <-- export for tests

if (require.main === module) {
  app.listen(port, () => console.log(`Listening on ${port}`))
}
```

The `require.main === module` guard prevents the server from starting (and WebSockets from opening) when the file is imported in tests.

## TypeScript setup

`@types/supertest` provides types. Import as:

```typescript
import request from 'supertest'
```

No extra tsconfig changes needed if `esModuleInterop: true` is set.

## Testing JSON responses

```typescript
const res = await request(app).get('/api/weather')
expect(res.status).toBe(200)
expect(res.body).toEqual({ features: [] })
expect(res.headers['x-cache']).toBe('miss')
```

## Testing SSE headers (endpoints that don't close)

Supertest's `.timeout()` + `.buffer(false)` approach is unreliable for reading headers before the body completes. The correct pattern is a raw `http.request` with immediate socket destruction:

```typescript
import http from 'http'

function getSseHeaders(
  server: http.Server,
  path: string,
): Promise<Record<string, string | string[]>> {
  return new Promise((resolve, reject) => {
    const addr = server.address() as { port: number }
    const req = http.request(
      { host: '127.0.0.1', port: addr.port, path, method: 'GET' },
      (res) => {
        resolve(res.headers as Record<string, string | string[]>)
        res.destroy()   // close immediately after reading headers
        req.destroy()
      },
    )
    req.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') return
      reject(err)
    })
    req.end()
  })
}

it('SSE route has correct headers', async () => {
  await new Promise<void>((done) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', async () => {
      try {
        const headers = await getSseHeaders(server, '/api/ais')
        expect(String(headers['content-type'])).toMatch(/text\/event-stream/)
        expect(headers['cache-control']).toBe('no-cache')
      } finally {
        server.close(() => done())
      }
    })
  })
})
```

Use `server.listen(0, ...)` to get a random free port — avoids port conflicts in parallel test runs.

## Mocking dependencies before importing the app

When the app imports modules with side effects (WebSocket connections, env validation), mock them first:

```typescript
// vitest
vi.mock('../lib/aisProxy', () => ({
  aisProxy: {
    connect: vi.fn(),
    getLatestPositions: vi.fn(() => new Map()),
    onPosition: vi.fn(() => () => {}),
  },
}))

process.env['REQUIRED_API_KEY'] = 'test-value'

const { default: app } = await import('../index')
```

## Gotchas

- **supertest does NOT bind to a port by default** — it uses `http.createServer` internally and closes after each request. This means SSE connections (that never end) will hold up the test unless you use the raw `http.request` approach above.
- **The app must be exported separately** — if `app.listen()` is called at module level unconditionally, supertest still works but side effects (WebSocket connects, DB connects) will run on import.
- **`res.body` is auto-parsed as JSON** when Content-Type is `application/json`. For other types use `res.text`.
- **Chained assertions**: supertest's `.expect(200)` style and vitest/jest `expect(res.status).toBe(200)` both work — mixing is fine.
