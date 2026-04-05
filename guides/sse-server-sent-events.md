# Server-Sent Events (SSE)

> Real-world experience from the Toronto Island Ferry Tracker v2 project.
> Backend: Express 5 + TypeScript · Frontend: React 18 + TypeScript (Vite)

---

## What is SSE?

Server-Sent Events (SSE) is a browser-native API for receiving a continuous stream of text events from a server over a single, long-lived HTTP connection.

Unlike WebSockets, SSE is:
- **Unidirectional** — server → client only. The client cannot send data over the SSE channel.
- **Auto-reconnecting** — the browser's `EventSource` retries automatically on disconnect, with exponential back-off built in.
- **HTTP/2 compatible** — multiplexed over an existing connection alongside regular requests.
- **Zero client-side libraries needed** — `EventSource` is a native browser API.

Use SSE when you need to push a stream of updates from server to client and you don't need the client to reply over the same channel (live feeds, dashboards, position streams, log tailing).

---

## SSE vs WebSocket — Quick Reference

| | SSE | WebSocket |
|---|---|---|
| Direction | Server → client only | Bidirectional |
| Protocol | HTTP/HTTPS | WS / WSS (upgrade handshake) |
| Auto-reconnect | Built-in (`EventSource`) | Manual — you must implement it |
| HTTP/2 support | Yes (multiplexed) | No (separate TCP connection) |
| Client library needed | No | `ws`, `socket.io`, or similar |
| Proxy/firewall friendly | Yes (plain HTTP) | Sometimes blocked |
| Typical use cases | Live feeds, dashboards, position streams | Chat, collaborative editing, games |

**Rule of thumb:** if you only need the server to push data and you want the simplest possible implementation, use SSE. Reach for WebSocket only when you need bidirectional communication.

---

## Express Backend Setup

### The Four Required Headers

All four headers must be set. Missing any one of them will silently break SSE — the response will buffer or the browser will not treat it as an event stream.

```typescript
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('Connection', 'keep-alive');
res.flushHeaders(); // send headers to client immediately — do not buffer
```

> **Gotcha:** `res.flushHeaders()` is critical. Without it, Node's HTTP layer buffers the response and the client receives nothing until the connection closes.

### Full Route Handler Pattern

```typescript
import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  // 1. Set SSE headers and flush immediately
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // 2. Send initial data snapshot (optional but recommended — gives the client
  //    something to render before the first live update arrives)
  const snapshot = getLatestData();
  for (const item of snapshot) {
    res.write(`data: ${JSON.stringify(item)}\n\n`);
  }

  // 3. Subscribe to live updates from your data source
  const unsubscribe = dataSource.on('update', (item) => {
    res.write(`data: ${JSON.stringify(item)}\n\n`);
  });

  // 4. Keep-alive: send a comment every 15 s to prevent proxy timeouts
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 15_000);

  // 5. Clean up when the client disconnects — CRITICAL to prevent memory leaks
  //    and dangling event listeners
  req.on('close', () => {
    unsubscribe();
    clearInterval(keepAlive);
  });
});

export default router;
```

### SSE Message Format

The double newline `\n\n` at the end of each message is mandatory — it signals the end of a single event to the browser.

| Format | Purpose |
|---|---|
| `data: <payload>\n\n` | Standard data event — `event.data` in the browser |
| `: comment text\n\n` | Comment — ignored by browser, used for keep-alive |
| `event: <name>\ndata: <payload>\n\n` | Named event — listen with `es.addEventListener('<name>', ...)` |
| `id: <id>\ndata: <payload>\n\n` | Event with ID — browser sends `Last-Event-ID` header on reconnect |

---

## Keep-Alive is Essential

> Without keep-alive comments, many reverse proxies (nginx, Cloudflare, AWS ALB, Fly.io's proxy) will silently close idle SSE connections after 60–90 seconds.

Send a comment line every 15 seconds:

```typescript
const keepAlive = setInterval(() => {
  res.write(': keep-alive\n\n');
}, 15_000);
```

This is a no-op for the browser — `EventSource` ignores comment lines — but it keeps the TCP connection alive through any proxy in the path.

---

## React Hook Pattern

A generic, reusable SSE hook. The ferry tracker's `useAISStream` follows this pattern exactly.

```typescript
import { useEffect, useRef, useState } from 'react';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

export function useSSEStream<T>(url: string) {
  const [data, setData] = useState<T[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('reconnecting');
  const offlineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource(url);

    // Reset a 30 s timer on every message. If no message arrives within
    // that window, the connection is considered offline.
    const resetOfflineTimer = () => {
      if (offlineTimer.current) clearTimeout(offlineTimer.current);
      offlineTimer.current = setTimeout(() => setStatus('offline'), 30_000);
    };

    es.onopen = () => resetOfflineTimer();

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as T;
        setStatus('connected');
        resetOfflineTimer();
        setData(prev => [...prev, parsed]);
      } catch {
        // Silently ignore malformed messages — don't crash the stream
      }
    };

    es.onerror = () => setStatus('reconnecting');
    // EventSource will automatically retry — no manual reconnection needed

    return () => {
      es.close();
      if (offlineTimer.current) clearTimeout(offlineTimer.current);
    };
  }, [url]); // Re-create EventSource if URL changes

  return { data, status };
}
```

### Connection Status State Machine

```
Initial state: 'reconnecting'
  ├─ onerror fires          → stays 'reconnecting' (EventSource auto-retries)
  ├─ first message received → 'connected'
  │    ├─ 30 s with no messages → 'offline'
  │    └─ message arrives again → 'connected'
  └─ url prop changes       → effect re-runs, back to 'reconnecting'
```

The 30-second offline window accounts for keep-alive messages arriving every 15 s — if two consecutive keep-alives are missed, the UI shows offline rather than silently appearing connected when the server is unreachable.

---

## Vite Dev Proxy for SSE

In development, if your frontend (`:5173`) calls your backend (`:3001`), configure Vite's dev proxy to avoid CORS issues. SSE works through the Vite proxy without any extra configuration.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

> **URL gotcha:** If your Express router is mounted at `/api/ais` with a `GET /` handler, the correct client URL is `/api/ais` — NOT `/api/ais/stream`. Always check `app.use()` mounting in your server `index.ts` to verify the exact path. A trailing slash mismatch is a common source of 404s.

---

## Registering the Router in Express

```typescript
// server/src/index.ts
import express from 'express';
import aisRouter from './routes/ais.js';

const app = express();

app.use('/api/ais', aisRouter);
// Client connects to: GET /api/ais
```

---

## Testing SSE Endpoints

### curl (simplest)

```bash
# -N disables output buffering — you'll see events in real time
curl -N http://localhost:3001/api/ais
```

Expected output:
```
data: {"mmsi":316045069,"lat":43.638,"lon":-79.377,"sog":4.2}

: keep-alive

data: {"mmsi":316045069,"lat":43.639,"lon":-79.378,"sog":4.1}
```

### Node.js / supertest

Direct SSE header testing requires raw `http.request` because supertest buffers responses. See the `supertest.md` guide for the raw HTTP pattern.

---

## Common Gotchas

| Symptom | Root cause | Fix |
|---|---|---|
| Client receives nothing until connection closes | `res.flushHeaders()` missing | Add `res.flushHeaders()` immediately after setting headers |
| Connection drops after ~60 s | No keep-alive, proxy timeout | Add `setInterval` that writes `: keep-alive\n\n` every 15 s |
| 404 on the EventSource URL | Router path mismatch | Check `app.use('/path', router)` vs the `GET /` handler inside the router |
| Memory grows over time | Forgot to clean up on disconnect | Add `req.on('close', () => { unsubscribe(); clearInterval(keepAlive); })` |
| CORS error in browser | Missing `cors()` middleware or wrong origin | Add `cors()` middleware to Express; configure allowed origins per environment |
| `onerror` fires immediately | Backend not running, or wrong URL | Check server is running and the URL matches the proxy config |

---

## Production Checklist

- [ ] `res.flushHeaders()` called immediately after setting SSE headers
- [ ] Keep-alive interval (15 s) set and cleared on `req.close`
- [ ] Event listeners / subscriptions unsubscribed on `req.close`
- [ ] CORS configured with explicit allowed origins (not `*`) in production
- [ ] AISSTREAM_API_KEY (or equivalent secret) is in Fly.io secrets, not committed to source
- [ ] Client `EventSource` URL matches the exact Express mount path
- [ ] Connection status indicator shown in UI (connected / reconnecting / offline)

---

## Reference: Real Implementation (Ferry Tracker)

- **Backend route:** `server/src/routes/ais.ts` — subscribes to `aisProxy` emitter, writes vessel positions as SSE events
- **Frontend hook:** `src/hooks/useAISStream.ts` — wraps `EventSource`, exposes `vessels` map + `status`
- **Proxy:** `server/src/lib/aisProxy.ts` — maintains WebSocket to aisstream.io, emits `'vessel'` events
- **Vite proxy config:** `vite.config.ts` — `/api` → `http://localhost:3001`

---

*Last updated: 2026-04-05 — Toronto Island Ferry Tracker v2 (project-hammer)*
