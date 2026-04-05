# Vite Dev Server Proxy

## The Problem

In development, your React app runs on `http://localhost:5173` (Vite) and your API server runs on `http://localhost:3001` (Express). Direct API calls from the browser to `:3001` are cross-origin and will be blocked by CORS unless you configure it — and even then, `credentials` handling adds complexity.

---

## The Solution: Vite Dev Proxy

Configure Vite to forward API requests transparently. The browser thinks it's talking to `:5173`; Vite proxies the request to `:3001`:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_'], // only VITE_* vars are embedded in the bundle
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // rewrite: (path) => path.replace(/^\/api/, ''), // uncomment if backend doesn't use /api prefix
      },
    },
  },
});
```

---

## How to Use It in Your Hooks

With the proxy configured, use relative URLs in your frontend code:

```typescript
// Good — works in dev (proxied) and prod (same-origin or VITE_API_URL)
const apiUrl = import.meta.env.VITE_API_URL ?? '';
fetch(`${apiUrl}/api/health`);

// In dev: VITE_API_URL is empty, so request goes to /api/health on :5173,
//         which Vite proxies to http://localhost:3001/api/health
// In prod: VITE_API_URL is 'https://your-backend.fly.dev',
//          so request goes directly to the backend
```

---

## `envPrefix` — Keep Secrets Out of the Bundle

```typescript
envPrefix: ['VITE_']
```

Only environment variables prefixed with `VITE_` are embedded in the browser bundle. Variables like `AISSTREAM_API_KEY` (without the prefix) remain server-side only, even if present in your `.env` file.

---

## SSE with the Vite Proxy

SSE (`EventSource`) works through the Vite proxy without any extra config. The proxy correctly handles streaming responses.

---

## Production: No Proxy Needed

The Vite proxy is dev-only. In production:

- Your frontend is served from S3/CloudFront (or similar static host)
- Set `VITE_API_URL` to your backend URL (e.g. `https://your-app.fly.dev`)
- Configure CORS on your Express server to allow requests from your frontend domain

---

## Environment Variable Validation

Create a `src/lib/config.ts` that reads and validates env vars at module load time:

```typescript
const maptilerApiKey = import.meta.env.VITE_MAPTILER_API_KEY as string ?? '';
const apiUrl = import.meta.env.VITE_API_URL as string ?? '';

if (import.meta.env.PROD && !maptilerApiKey) {
  throw new Error('VITE_MAPTILER_API_KEY is required in production');
}

export const config = { maptilerApiKey, apiUrl } as const;
```

This **fails fast** in production if required keys are missing, rather than silently rendering a broken map.

---

## Gotchas & Platform Notes

- **`VITE_API_URL` should be empty string (not undefined) in `.env.development`** so the fallback `?? ''` produces a relative URL that the proxy can intercept.
- **WebSocket proxying** requires an additional `ws: true` flag in the proxy config if your dev server also needs to proxy WebSocket connections (not needed for SSE).
- **`changeOrigin: true`** rewrites the `Host` header to match the target; without it, some servers reject the request.
- **Path rewriting:** If your backend routes are at `/ais` but you call `/api/ais` from the frontend, use the `rewrite` option to strip the `/api` prefix before forwarding.
