# aisstream.io — Real-Time AIS WebSocket API

**Website:** https://aisstream.io
**Protocol:** WebSocket (`wss://`)
**Use case:** Real-time vessel position data (AIS — Automatic Identification System)
**Cost:** Free tier available

---

## What is aisstream.io?

aisstream.io provides a free WebSocket API for real-time AIS data. AIS (Automatic Identification System) is the maritime tracking standard — every commercial vessel broadcasts its MMSI (unique ID), position, speed, heading, and name. aisstream.io aggregates these signals from a global receiver network and exposes them as a filterable WebSocket stream.

**Good for:** Tracking specific vessels by MMSI, monitoring a geographic bounding box, building maritime dashboards.

---

## Account & API Key Setup

1. Create a free account at https://aisstream.io
2. Generate an API key in the dashboard
3. Store it as `AISSTREAM_API_KEY` in your environment (never in frontend bundles)

**Free tier limits:**
- Must filter by bounding box and/or specific MMSIs
- Subscribing to unfiltered global AIS on the free tier will get you rate-limited immediately
- Up to ~4 MMSI filters works well within free tier

---

## CRITICAL GOTCHA: Browser WebSocket is Blocked

> **aisstream.io does NOT send CORS headers on WebSocket handshake responses.**

Direct browser connections (`new WebSocket('wss://stream.aisstream.io/...')`) will be **blocked by the browser**. This is non-negotiable — you cannot work around it client-side.

**Required architecture:**

```
Browser  ←──SSE or WS──  Your Backend Server  ←──WebSocket──  aisstream.io
```

Your backend connects to aisstream.io and relays data to browsers via SSE (recommended for one-directional data) or a backend WebSocket. SSE is preferred because `EventSource` auto-reconnects, requires no library on the client, and is HTTP/2 compatible.

---

## Node.js / TypeScript Setup

```bash
npm install ws
npm install -D @types/ws
```

```typescript
import WebSocket from 'ws';
```

---

## WebSocket Subscription Message

After the connection opens, send a JSON subscription message:

```typescript
const subscriptionMessage = {
  APIKey: process.env.AISSTREAM_API_KEY,
  BoundingBoxes: [[
    [43.58, -79.42],   // [south, west]
    [43.66, -79.32]    // [north, east]
  ]],
  FiltersShipMMSI: ["316045069", "316045081", "316045082", "316050853"],
  FilterMessageTypes: ["PositionReport"]
};

ws.send(JSON.stringify(subscriptionMessage));
```

**Parameter notes:**

| Field | Type | Notes |
|---|---|---|
| `APIKey` | `string` | Your API key |
| `BoundingBoxes` | `[[[lat,lng],[lat,lng]]]` | Array of boxes, each `[[south,west],[north,east]]` — **lat/lng order, NOT lng/lat** |
| `FiltersShipMMSI` | `string[]` | MMSIs as **strings**, not numbers |
| `FilterMessageTypes` | `string[]` | Use `["PositionReport"]` for position updates only |

> **Coordinate order gotcha:** BoundingBoxes uses `[latitude, longitude]` order (not the GeoJSON `[lng, lat]` convention). Double-check this when setting up your bounding box.

> **MMSI type gotcha:** `FiltersShipMMSI` expects strings. Passing numbers will silently fail to match vessels.

> **Omitting BoundingBoxes:** If you omit `BoundingBoxes`, you subscribe to global AIS data — extremely high volume. Only do this on a paid plan.

---

## Incoming Message Shape

Each incoming message is a JSON object. Parse it and read from `Message.PositionReport`:

```typescript
interface AISMessage {
  MessageType: string;
  MetaData: {
    MMSI: number;
    ShipName: string;
    latitude: number;
    longitude: number;
    time_utc: string;   // "2026-04-05 12:34:56" — no timezone suffix!
  };
  Message: {
    PositionReport: {
      TrueHeading: number;  // 0–359, or 511 if unavailable
      Sog: number;          // Speed over ground, knots
      Cog: number;          // Course over ground, degrees
      Latitude: number;
      Longitude: number;
    };
  };
}
```

---

## Gotcha: TrueHeading = 511 Sentinel Value

When `TrueHeading` is `511`, the vessel's heading sensor is **unavailable**. This is a valid AIS sentinel, not an error. Fall back to `Cog` (course over ground):

```typescript
const heading =
  msg.Message.PositionReport.TrueHeading === 511
    ? msg.Message.PositionReport.Cog
    : msg.Message.PositionReport.TrueHeading;
```

---

## Gotcha: time_utc Has No Timezone Suffix

`MetaData.time_utc` looks like `"2026-04-05 12:34:56"` — **no `Z`, no `+00:00`**. Passing this directly to `new Date()` will be parsed as **local time** in some JS environments (Node.js behavior depends on the system timezone).

**Always append ` UTC` before parsing:**

```typescript
const timestamp = new Date(msg.MetaData.time_utc + ' UTC').toISOString();
```

---

## Reconnection with Exponential Backoff

aisstream.io will occasionally drop connections. Implement exponential backoff:

```typescript
import WebSocket from 'ws';

const WS_URL = 'wss://stream.aisstream.io/v0/stream';
let reconnectDelay = 1000;
const MAX_DELAY = 30_000;

function connect() {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    reconnectDelay = 1000; // reset on successful connection
    ws.send(JSON.stringify({
      APIKey: process.env.AISSTREAM_API_KEY,
      BoundingBoxes: [[[43.58, -79.42], [43.66, -79.32]]],
      FiltersShipMMSI: ['316045069', '316045081'],
      FilterMessageTypes: ['PositionReport'],
    }));
  });

  ws.on('message', (data: WebSocket.RawData) => {
    const msg = JSON.parse(data.toString()) as AISMessage;
    if (msg.MessageType !== 'PositionReport') return;

    const heading =
      msg.Message.PositionReport.TrueHeading === 511
        ? msg.Message.PositionReport.Cog
        : msg.Message.PositionReport.TrueHeading;

    const timestamp = new Date(msg.MetaData.time_utc + ' UTC').toISOString();

    // Forward to clients...
  });

  ws.on('close', () => {
    console.log(`[aisstream] disconnected — reconnecting in ${reconnectDelay}ms`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
  });

  ws.on('error', (err: Error) => {
    console.error('[aisstream] error:', err.message);
    // 'close' will fire after 'error', triggering reconnect
  });
}

connect();
```

---

## Full Backend Proxy Example (Express + SSE)

```typescript
// server/src/lib/aisProxy.ts
import WebSocket from 'ws';
import { Response } from 'express';

const WS_URL = 'wss://stream.aisstream.io/v0/stream';
const clients = new Set<Response>();

let reconnectDelay = 1000;
const MAX_DELAY = 30_000;

export function broadcast(data: string): void {
  for (const res of clients) {
    res.write(`data: ${data}\n\n`);
  }
}

export function addClient(res: Response): void {
  clients.add(res);
}

export function removeClient(res: Response): void {
  clients.delete(res);
}

function connect(): void {
  const ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    reconnectDelay = 1000;
    ws.send(JSON.stringify({
      APIKey: process.env.AISSTREAM_API_KEY,
      BoundingBoxes: [[[43.58, -79.42], [43.66, -79.32]]],
      FiltersShipMMSI: ['316045069', '316045081', '316045082', '316050853'],
      FilterMessageTypes: ['PositionReport'],
    }));
  });

  ws.on('message', (data: WebSocket.RawData) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.MessageType !== 'PositionReport') return;

      const heading =
        msg.Message.PositionReport.TrueHeading === 511
          ? msg.Message.PositionReport.Cog
          : msg.Message.PositionReport.TrueHeading;

      const normalized = {
        mmsi: msg.MetaData.MMSI,
        name: msg.MetaData.ShipName.trim(),
        lat: msg.Message.PositionReport.Latitude,
        lng: msg.Message.PositionReport.Longitude,
        heading,
        sog: msg.Message.PositionReport.Sog,
        timestamp: new Date(msg.MetaData.time_utc + ' UTC').toISOString(),
      };

      broadcast(JSON.stringify(normalized));
    } catch (err) {
      console.error('[aisstream] parse error:', err);
    }
  });

  ws.on('close', () => {
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
  });

  ws.on('error', (err: Error) => {
    console.error('[aisstream] error:', err.message);
  });
}

// SSE route handler (Express)
// router.get('/ais', (req, res) => {
//   res.setHeader('Content-Type', 'text/event-stream');
//   res.setHeader('Cache-Control', 'no-cache');
//   res.setHeader('Connection', 'keep-alive');
//   res.flushHeaders();
//   addClient(res);
//   req.on('close', () => removeClient(res));
// });

connect();
```

---

## Message Rate & Expectations

- With 4 MMSI filters and a small bounding box, expect **~1 position update per vessel per 10 seconds**
- This is normal — AIS Class B transponders (smaller vessels) report every 3–30 seconds depending on speed
- Plan for smooth interpolation on the frontend (lerp between updates at 60fps) rather than relying on high-frequency updates

---

## Checklist: Zero to Working Proxy

- [ ] Create account and get API key at https://aisstream.io
- [ ] Set `AISSTREAM_API_KEY` in `.env` (never commit, never expose to frontend)
- [ ] `npm install ws && npm install -D @types/ws`
- [ ] Build a backend WebSocket client with reconnection/backoff
- [ ] Subscribe with `BoundingBoxes` (lat/lng order!) and `FiltersShipMMSI` (strings!)
- [ ] Handle `TrueHeading === 511` by falling back to `Cog`
- [ ] Append `' UTC'` to `time_utc` before parsing as a Date
- [ ] Relay messages to browser clients over SSE or backend WebSocket
- [ ] Test with `wscat -c wss://stream.aisstream.io/v0/stream` to verify raw connectivity

---

## Quick Test with wscat

```bash
npm install -g wscat
wscat -c wss://stream.aisstream.io/v0/stream
```

Once connected, paste the subscription message manually to verify your API key and bounding box produce data.

---

## Discovered In

Toronto Island Ferry Tracker v2 (project-hammer) — April 2026
Backend: Node.js 20, Express 5, `ws` 8.x, deployed to Fly.io (region: yyz)
