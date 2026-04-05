# MapLibre Vessel Animation — lerp + requestAnimationFrame

Smooth real-time marker movement for GPS/AIS position updates on MapLibre GL JS maps.

---

## The Problem

GPS and AIS position updates arrive at coarse intervals (typically 5–30 seconds). Rendering markers by jumping directly to each new position produces jarring, discrete movement. The solution is to **interpolate (lerp) between the previous and new positions at 60fps** using `requestAnimationFrame`, making vessels appear to glide smoothly across the map.

This pattern works for any real-time map application: AIS vessel tracking, vehicle fleets, delivery tracking, drone telemetry, etc.

---

## Stack

- **MapLibre GL JS** v5+ (open source, no proprietary token required)
- **react-map-gl** v8+ (MapLibre adapter for React)
- **React** 18 with hooks

---

## Core Interpolation Utilities

```typescript
// src/lib/interpolation.ts

/** Linear interpolation between two values */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolate between two angles (degrees, 0-359).
 * Always takes the shortest arc — handles the 359→0 wraparound correctly.
 * e.g. lerpAngle(350, 10, 0.5) = 0, not 180
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180; // shortest arc in range [-180, 180]
  return (a + delta * t + 360) % 360;
}

/** Interpolate between two vessel positions */
export function lerpPosition<T extends { latitude: number; longitude: number; heading: number }>(
  from: T,
  to: T,
  t: number,
): T {
  return {
    ...to, // non-interpolated fields come from target
    latitude: lerp(from.latitude, to.latitude, t),
    longitude: lerp(from.longitude, to.longitude, t),
    heading: lerpAngle(from.heading, to.heading, t),
  };
}
```

### lerpAngle Edge Case

When two angles are exactly 180° apart, the algorithm picks the counterclockwise direction (e.g. `lerpAngle(0, 180, 0.5) = 270`, not 90). This is mathematically valid — it is a tie. In practice, vessels never make 180° heading reversals instantaneously, so this edge case does not occur with real AIS data.

---

## useAnimationFrame Hook

```typescript
// src/hooks/useAnimationFrame.ts
import { useEffect, useLayoutEffect, useRef } from 'react';

export function useAnimationFrame(callback: (timestamp: number) => void): void {
  const callbackRef = useRef(callback);

  // useLayoutEffect keeps the ref synchronously updated before the next paint
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let rafId: number;
    const loop = (timestamp: number) => {
      callbackRef.current(timestamp);
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []); // empty deps — intentional, the ref handles staleness
}
```

### Why `useLayoutEffect` for the ref update?

`useEffect` runs asynchronously after paint. If `callback` changes (e.g. because it captures updated state), `useEffect` would run the old callback for one frame before updating the ref. `useLayoutEffect` runs synchronously before the next paint, ensuring the ref is always current. The empty deps array on `useEffect` is intentional — the ref update handles staleness without needing a re-subscription.

---

## useVesselPositions Hook — Full Pattern

```typescript
// src/hooks/useVesselPositions.ts
import { useRef, useState } from 'react';
import { useAISStream } from './useAISStream';
import { useAnimationFrame } from './useAnimationFrame';
import { lerpPosition } from '../lib/interpolation';
import type { VesselPosition } from '../types/ais';
import type { Vessel } from '../types/vessel';

const AIS_INTERVAL_MS = 10_000;    // expected time between AIS pings
const OFFLINE_THRESHOLD_MS = 60_000;
const DOCKED_SPEED_KN = 0.5;

export function useVesselPositions() {
  const { vessels: rawVessels, connectionStatus } = useAISStream();

  // Three refs track the lerp state — no React state, no re-renders during animation
  const fromRef = useRef<Map<number, VesselPosition>>(new Map());
  const targetRef = useRef<Map<number, VesselPosition>>(new Map());
  const animStartRef = useRef<Map<number, number>>(new Map()); // mmsi → rAF timestamp

  const [interpolated, setInterpolated] = useState<Vessel[]>([]);

  useAnimationFrame((timestamp) => {
    const now = Date.now();
    const result: Vessel[] = [];

    rawVessels.forEach((current, mmsi) => {
      const previousTarget = targetRef.current.get(mmsi);

      // Detect new AIS update: timestamp changed
      if (!previousTarget || previousTarget.timestamp !== current.timestamp) {
        // Slide: current target becomes new origin
        fromRef.current.set(mmsi, previousTarget ?? current);
        targetRef.current.set(mmsi, current);
        animStartRef.current.set(mmsi, timestamp);
      }

      const from = fromRef.current.get(mmsi) ?? current;
      const animStart = animStartRef.current.get(mmsi) ?? timestamp;
      const t = Math.min((timestamp - animStart) / AIS_INTERVAL_MS, 1);

      const pos = lerpPosition(from, current, t);
      const ageMs = now - new Date(current.timestamp).getTime();

      result.push({
        ...pos,
        status: ageMs > OFFLINE_THRESHOLD_MS ? 'offline'
               : current.speed < DOCKED_SPEED_KN ? 'docked'
               : 'moving',
        lastSeen: new Date(current.timestamp),
      });
    });

    setInterpolated(result);
  });

  return { vessels: interpolated, connectionStatus };
}
```

### Key design decisions in this hook

| Decision | Reason |
|---|---|
| Three `useRef` Maps (from, target, animStart) | Mutation inside `requestAnimationFrame` does not need to trigger React re-renders — only the final `setInterpolated` does |
| Detect new update via `timestamp` comparison | Avoids deep equality checks; AIS timestamps are unique per ping |
| `previousTarget ?? current` on first appearance | Prevents a lerp from `(0, 0)` when a vessel is seen for the first time |
| `t = Math.min(..., 1)` clamp | Holds position at the target if the next AIS ping is late |

---

## Rendering on MapLibre

Render interpolated vessels as a GeoJSON source that updates every frame. MapLibre efficiently handles this because a GeoJSON source update only re-renders the affected layer, not the whole map.

```typescript
import { Source, Layer } from 'react-map-gl/maplibre';
import type { FeatureCollection, Point } from 'geojson';

// Build GeoJSON from interpolated vessels
const geojson: FeatureCollection<Point> = {
  type: 'FeatureCollection',
  features: vessels.map(v => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [v.longitude, v.latitude] },
    properties: { heading: v.heading, status: v.status, mmsi: v.mmsi },
  })),
};

// In JSX:
<Source id="vessels" type="geojson" data={geojson}>
  <Layer id="vessels-circle" type="circle" paint={{ 'circle-radius': 8 }} />
  <Layer
    id="vessels-symbol"
    type="symbol"
    layout={{ 'icon-image': 'vessel-icon', 'icon-rotate': ['get', 'heading'] }}
  />
</Source>
```

---

## Performance Notes

- The `setInterpolated` call in `useAnimationFrame` triggers a React re-render every frame (60fps). This is acceptable because only the GeoJSON `data` prop changes — MapLibre's internal diff efficiently updates only the moved features.
- For large numbers of vessels (100+), consider one of:
  - Debounce to 30fps: track a frame counter and call `setInterpolated` every other frame
  - Bypass React entirely: hold a ref to the MapLibre `map` instance and call `map.getSource('vessels').setData(geojson)` imperatively — zero React renders, maximum throughput
- Keep lerp computation and GeoJSON construction out of React render functions — do it inside the animation loop using refs — to minimise React work per frame.
- `requestAnimationFrame` timestamps are `DOMHighResTimeStamp` (milliseconds, sub-millisecond precision). `Date.now()` is used separately only for wall-clock age checks (offline detection), not for lerp `t` calculation.

---

## Data Flow Summary

```
AIS WebSocket (aisstream.io)
        │
        ▼
  SSE backend proxy (Fly.io / Express)
        │
        ▼
  useAISStream() — raw VesselPosition map, keyed by MMSI
        │
        ▼
  useVesselPositions() — rAF loop, lerp between raw pings
        │
        ▼
  Vessel[] (60fps interpolated positions)
        │
        ▼
  GeoJSON FeatureCollection → MapLibre <Source> → <Layer>
```

---

## File Checklist

| File | Purpose |
|---|---|
| `src/lib/interpolation.ts` | `lerp`, `lerpAngle`, `lerpPosition` utilities |
| `src/hooks/useAnimationFrame.ts` | RAF loop with stale-closure-safe ref pattern |
| `src/hooks/useVesselPositions.ts` | Wires AIS stream → lerp state → interpolated output |
| `src/hooks/useAISStream.ts` | SSE connection to backend, returns raw vessel map |
| `src/types/ais.ts` | `VesselPosition` type (latitude, longitude, heading, speed, timestamp, mmsi) |
| `src/types/vessel.ts` | `Vessel` type (extends VesselPosition with status, lastSeen) |

---

## Gotchas

- **Do not use `useEffect` deps to trigger lerp resets** — the animation loop runs every frame; detecting updates via ref comparison inside the loop is more reliable and avoids stale closure bugs.
- **`lerpAngle` requires degrees 0–359**, not radians. AIS heading is always in degrees; MapLibre `icon-rotate` also expects degrees.
- **MapLibre `icon-rotate` is clockwise from north** — this matches AIS heading convention (0° = north, 90° = east), so no conversion is needed.
- **SSE auto-reconnects**; when the stream drops and reconnects, vessels will briefly have stale `from` refs. The `OFFLINE_THRESHOLD_MS` status check handles display; the lerp will resume correctly once new pings arrive.
- **Vessels that disappear from the stream** (offline) remain in the `Map` refs indefinitely. Add a cleanup pass if memory matters (e.g. evict entries not updated in the last N minutes).
