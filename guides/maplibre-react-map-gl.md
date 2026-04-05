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
