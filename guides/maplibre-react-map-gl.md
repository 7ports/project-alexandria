# MapLibre GL JS + react-map-gl Setup Guide

## Overview
MapLibre GL JS is an open-source fork of Mapbox GL JS. `react-map-gl` v8 provides a React adapter that works with both MapLibre and Mapbox. Together they're the standard for open-source interactive maps in React apps.

## Versions (as of 2026-04-05)
- `maplibre-gl`: v5.x (current major)
- `react-map-gl`: v8.x (supports MapLibre v5)
- create-vite: v9.x scaffolds React 19 + Vite 8 (not React 18/Vite 5)

## Installation

```bash
npm install react-map-gl maplibre-gl
```

No extra type packages needed — both ship with TypeScript types.

## Platform Notes (Windows)
- Installs cleanly on Windows with Git Bash / npm
- No native compilation required — pure JS/WASM

## Basic Usage

```tsx
import Map from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

// IMPORTANT: import from 'react-map-gl/maplibre', not 'react-map-gl'
// The /maplibre subpath uses MapLibre instead of Mapbox

function FerryMap() {
  return (
    <Map
      initialViewState={{
        longitude: -79.385,
        latitude: 43.634,
        zoom: 13,
        pitch: 40,
      }}
      style={{ width: '100%', height: '100vh' }}
      mapStyle="https://api.maptiler.com/maps/ocean/style.json?key=YOUR_KEY"
      cooperativeGestures={true}  // prevents scroll hijacking on mobile
    >
      {/* child layers go here */}
    </Map>
  )
}
```

## Key Import Path
```typescript
// CORRECT for MapLibre
import Map, { Layer, Source, Marker, Popup } from 'react-map-gl/maplibre'

// WRONG — this uses Mapbox GL JS and requires a Mapbox token
import Map from 'react-map-gl'
```

## CSS Import
Always import the MapLibre CSS in your entry point or map component:
```typescript
import 'maplibre-gl/dist/maplibre-gl.css'
```
Without this, the map controls (zoom, compass) will be unstyled.

## MapTiler Ocean Style
For the Toronto Ferry Tracker (and any nautical app), use the Ocean basemap:
```
https://api.maptiler.com/maps/ocean/style.json?key=VITE_MAPTILER_API_KEY
```
Free tier: 100K tile views/month. Key available at cloud.maptiler.com.

Use `import.meta.env.VITE_MAPTILER_API_KEY` in Vite to inject the key at build time.

## Vite Config Note
No special Vite config needed for MapLibre v5. It bundles cleanly with `@vitejs/plugin-react`.

## GeoJSON Layers Pattern
```tsx
import { Source, Layer } from 'react-map-gl/maplibre'

<Source id="vessels" type="geojson" data={geojsonFeatureCollection}>
  <Layer
    id="vessel-icons"
    type="symbol"
    layout={{
      'icon-image': 'ferry-icon',
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
    }}
  />
</Source>
```

## Custom Icons
Load custom SVG/PNG icons via the `onLoad` map callback:
```tsx
<Map onLoad={(e) => {
  const map = e.target
  // load image from public/ or as imported asset
  map.loadImage('/icons/ferry.png', (err, image) => {
    if (!err && image) map.addImage('ferry-icon', image)
  })
}}>
```

## Gotchas
- Always use `react-map-gl/maplibre` subpath (not root import)
- CSS import is required or map controls break
- `cooperativeGestures={true}` is essential for full-bleed mobile maps (prevents page scroll hijack)
- MapLibre v5 dropped support for older `expression` syntax from v3/v4 — use current expression syntax

---

## MapLibre GL JS v5 — Type Import Changes

In MapLibre GL JS v5, layer specification types were moved out of the main `maplibre-gl` package and into `@maplibre/maplibre-gl-style-spec`. Using the old import path causes TypeScript errors.

### What changed
In v4 (old — will error in v5):
```typescript
import type { CircleLayer, SymbolLayer, LineLayer } from 'maplibre-gl'; // ❌ does not exist in v5
```

In v5 (correct):
```typescript
import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
  LineLayerSpecification,
  FilterSpecification,
} from '@maplibre/maplibre-gl-style-spec'; // ✅
```

`@maplibre/maplibre-gl-style-spec` is a transitive dependency of `maplibre-gl` — it is already installed when you install `maplibre-gl`. You do not need to add it separately.

### Types that remain in `maplibre-gl`
These types did NOT move and are still imported from `maplibre-gl`:
- `MapLibreEvent` — the `onLoad` callback event type
- `MapLayerMouseEvent` — click/hover event on a layer
- `Map` — the core map class (import as `type Map as MaplibreMap` to avoid collision with the global `Map`)

### react-map-gl Layer props
The `Layer` component from `react-map-gl/maplibre` accepts `LayerProps`, which is typed as `OptionalSource<OptionalId<LayerSpecification>>`. Spreading a full `*LayerSpecification` object (which includes `source` and `id`) is valid — the `source` field is optional and harmless when the `Layer` is a child of a `Source`.

```typescript
import type { CircleLayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import { Source, Layer } from 'react-map-gl/maplibre';

const circleLayer: CircleLayerSpecification = {
  id: 'my-layer',
  type: 'circle',
  paint: { 'circle-radius': 8, 'circle-color': '#00e5ff' },
};

// In JSX:
<Source id="my-source" type="geojson" data={geojson}>
  <Layer {...circleLayer} />
</Source>
```

### FilterSpecification — array literal gotcha
MapLibre filter expressions are typed as `ExpressionSpecification`, which is a wide variadic union. TypeScript cannot infer a plain array literal as a valid `FilterSpecification`. Use a type assertion:

```typescript
filter: ['==', ['get', 'mmsi'], selectedMmsi ?? -1] as FilterSpecification
```

### useMap() — imperative map access inside children
To access the MapLibre `Map` instance from inside a child of `<Map>`, use the `useMap` hook:

```typescript
import { useMap } from 'react-map-gl/maplibre';

function MyLayer() {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map) return;
    map.on('click', 'my-layer', (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      // handle click...
    });
    return () => map.off('click', 'my-layer', handler);
  }, [map]);
}
```

---

## MapTiler — Account Setup & API Key

MapTiler provides map tile styles (including the Ocean style used in this project) via a CDN. You need an API key to use it.

### Account creation
1. Go to https://cloud.maptiler.com and sign up (free tier available)
2. Free tier: **100,000 tile requests/month**, suitable for development and low-traffic apps
3. Navigate to **Account → API Keys** to create a key

### API Key setup
Store the key as an environment variable — never hardcode it:
```bash
# .env (never commit this file)
VITE_MAPTILER_API_KEY=your_key_here
```

In a Vite project, prefix with `VITE_` so it's available in the browser bundle via `import.meta.env.VITE_MAPTILER_API_KEY`.

**Note:** MapTiler API keys are necessarily client-visible (embedded in tile requests). Mitigate this by restricting the key by HTTP referrer in the MapTiler dashboard: only allow requests from your production domain.

### Ocean style URL
```typescript
const mapStyle = `https://api.maptiler.com/maps/ocean/style.json?key=${apiKey}`;
```

Other popular styles: `streets-v2`, `satellite`, `topo`, `basic-v2`.

### Production security
In the MapTiler dashboard, under your API key settings:
- Add an **HTTP referrer restriction** (e.g. `https://yourdomain.com/*`)
- This prevents others from using your key if they find it in your bundle
- In development, also allow `http://localhost:5173/*`
