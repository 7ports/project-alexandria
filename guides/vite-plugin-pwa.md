# vite-plugin-pwa — PWA Setup with Vite + Workbox

> Based on real-world integration with Vite 5 (React + TypeScript) in April 2026.
> Covers installation, Workbox cache strategies, and common gotchas.

---

## What is vite-plugin-pwa

`vite-plugin-pwa` is the standard way to add Progressive Web App (PWA) support to a Vite project. It uses **Workbox** under the hood to generate a service worker and a web app manifest.

- Generates a service worker via Workbox (`generateSW` mode, default) or injects a manifest into your own SW (`injectManifest` mode)
- Handles `manifest.json` generation
- Supports `autoUpdate` (SW replaces itself on new deploys) or `prompt` (user confirms update)
- Works with Vite 4, 5 (peer dep range may lag behind actual Vite versions — see Gotcha #1)

---

## Installation

```bash
# As of April 2026: requires --legacy-peer-deps with Vite 5+
# The package's declared peer dep range has not been updated to cover Vite 5/8
npm install vite-plugin-pwa --legacy-peer-deps
```

> **Gotcha #1 — Peer dep conflict:** `vite-plugin-pwa` may not declare your Vite version in its `peerDependencies` range, causing `npm install` to fail with `ERESOLVE`. The `--legacy-peer-deps` flag bypasses this. The package works correctly at runtime despite the version mismatch — this is a metadata lag issue, not a compatibility problem.

---

## Basic Setup (`vite.config.ts`)

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'favicon.ico'],
      manifest: {
        name: 'My App',
        short_name: 'App',
        description: 'My progressive web app',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        lang: 'en',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
```

---

## Workbox Cache Strategies

The `workbox.runtimeCaching` array controls how different URL patterns are cached. Add it inside the `VitePWA({...})` config:

```typescript
VitePWA({
  // ... manifest config above ...
  workbox: {
    runtimeCaching: [
      // --- Map tile CDNs (large, static, expensive to re-fetch) ---
      {
        urlPattern: /^https:\/\/api\.maptiler\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'maptiler-tiles',
          expiration: {
            maxEntries: 200,         // LRU eviction
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          },
          cacheableResponse: { statuses: [0, 200] }, // 0 = opaque cross-origin
        },
      },
      // --- Semi-static data (schedule, config) ---
      {
        urlPattern: /\/schedule\.json$/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'schedule-data',
          expiration: { maxEntries: 5, maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // --- Live API routes (weather, status) — network first, cache fallback ---
      {
        urlPattern: /\/api\/(?!ais).*/i,   // exclude SSE endpoints
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-data',
          networkTimeoutSeconds: 10,
          expiration: { maxEntries: 20, maxAgeSeconds: 5 * 60 },
        },
      },
    ],
    navigateFallback: '/index.html',  // SPA routing fallback
  },
})
```

### Strategy selection guide

| Handler | Use for | Behaviour |
|---|---|---|
| `CacheFirst` | Map tiles, fonts, versioned assets | Serve from cache; fetch on miss or expiry |
| `StaleWhileRevalidate` | Semi-static data (schedules, config JSON) | Serve cache immediately, update in background |
| `NetworkFirst` | Live API data (weather, status) | Try network first; fall back to cache on timeout/failure |
| `NetworkOnly` | SSE streams, real-time WebSocket endpoints | Never cache — always live |

> **Gotcha #2 — Do NOT cache SSE endpoints:** SSE (`/api/ais` or similar) must be `NetworkOnly` or excluded from caching entirely. Caching an SSE response will return stale event data or a frozen stream. Use a negative lookahead in the URL pattern: `/\/api\/(?!ais).*/i`.

---

## Icon Requirements

PWA audits require icons at specific sizes. Minimum:
- `192x192` — home screen icon
- `512x512` — splash screen icon
- `512x512` with `"purpose": "maskable"` — adaptive icon (Android)

You can generate these from an SVG source with `sharp` or the `pwa-asset-generator` package:

```bash
npx pwa-asset-generator icon.svg ./public/icons --index ./public/index.html --manifest ./public/manifest.json
```

Or generate programmatically with `sharp`:

```typescript
import sharp from 'sharp'
await sharp('public/icons/icon.svg').resize(192).png().toFile('public/icons/icon-192.png')
await sharp('public/icons/icon.svg').resize(512).png().toFile('public/icons/icon-512.png')
```

---

## `registerType` options

| Value | Behaviour |
|---|---|
| `'autoUpdate'` | SW replaces itself automatically on new build. Best for most apps. |
| `'prompt'` | Fires a `needRefresh` event — you can show a "Update available" UI. |

For most production apps, `autoUpdate` is correct. Use `prompt` only if users have unsaved state that a mid-session SW update would discard.

---

## Dev Mode

In dev mode (`npm run dev`), the PWA plugin is disabled by default — the service worker is NOT registered. This is intentional; Workbox in dev can cause confusing cache issues.

To test the SW locally, build and preview:

```bash
npm run build && npm run preview
```

---

## Gotchas Summary

| # | Gotcha | Fix |
|---|---|---|
| 1 | `npm install` fails: peer dep conflict with Vite version | Use `--legacy-peer-deps` |
| 2 | SSE/real-time endpoints get cached | Exclude with negative lookahead: `/\/api\/(?!ais).*/` |
| 3 | SW not active in dev | Expected — build + preview to test |
| 4 | `navigateFallback` missing | Add `navigateFallback: '/index.html'` for SPA routing |
| 5 | Maskable icon missing | Lighthouse PWA audit fails without a `maskable` icon |
| 6 | `maxEntries` not set on tile cache | Without LRU limit, tile cache grows unbounded (hundreds of MB) |

---

## Related Guides

- `vite-dev-proxy` — Vite dev proxy config
- `maplibre-react-map-gl` — MapLibre setup (uses map tile caching)
