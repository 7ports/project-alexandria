# Toronto City Open Data — Ferry Service Status API

> Discovered during the Toronto Island Ferry Tracker v2 project (project-hammer).
> Last updated: 2026-04-05.

---

## Overview

The City of Toronto publishes a live, no-auth JSON endpoint for ferry service status:

```
https://www.toronto.ca/data/parks/live/ferry.json
```

This is the same data source the City's own website status widget uses. It covers operational status, service alerts, seasonal closures, and maintenance notices for the Jack Layton Ferry Terminal (Toronto Islands service).

---

## Discovery

This endpoint is **undocumented**. It was discovered by inspecting the network requests made by the live status widget on the City's ferry information page:

```
https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/beaches-gardens-attractions/toronto-island-park/ferries-to-toronto-island-park/
```

The same schema is reused across other parks facilities — e.g., `/data/parks/live/skate.json` for skating rinks. It appears to be a generic City of Toronto Parks CMS live-data endpoint pattern.

---

## Quick Setup

No authentication, no API key, no registration required. Hit the endpoint directly from a server-side context (see CORS gotcha below).

```typescript
const res = await fetch('https://www.toronto.ca/data/parks/live/ferry.json', {
  headers: { 'User-Agent': 'your-app/1.0' },
  signal: AbortSignal.timeout(8000),
});
const data = await res.json();
const ferryAsset = data.assets.find((a: any) => a.LocationID === 3789);
```

---

## Response Shape

```json
{
  "assets": [
    {
      "LocationID": 3789,
      "AssetID": 14127,
      "PostedDate": "2026-04-03 20:57:57",
      "AssetName": "JACK LAYTON FERRY TERMINAL",
      "SeasonStart": null,
      "SeasonEnd": null,
      "Reason": "Maintenance/Repair",
      "Comments": "Due to ongoing infrastructure improvements at the Jack Layton Ferry Terminal, vehicle service will be suspended from <b>Thursday, April 2, 2026, through Tuesday, April 7, 2026, inclusive.</b>",
      "Status": 2
    }
  ]
}
```

The `assets` array may contain multiple entries for different parks facilities. **Always filter by `LocationID === 3789`** to isolate the ferry terminal record.

---

## Field Reference

| Field | Type | Notes |
|---|---|---|
| `LocationID` | integer | `3789` = Jack Layton Ferry Terminal. **Always filter on this.** Other IDs belong to unrelated parks assets. |
| `AssetID` | integer | Internal CMS ID — not useful for display |
| `PostedDate` | string | Format: `"YYYY-MM-DD HH:mm:ss"` in **Eastern Time** (naive — no timezone suffix) |
| `AssetName` | string | Human-readable facility name, e.g. `"JACK LAYTON FERRY TERMINAL"` |
| `SeasonStart` / `SeasonEnd` | string or null | ISO date strings for seasonal closures; `null` if not applicable |
| `Reason` | string or null | Short category label: `"Maintenance/Repair"`, `"Weather"`, `"Mechanical"`, `"Accident"` |
| `Comments` | string or null | Full advisory text — **contains HTML tags** (`<b>`, etc.) — strip before display |
| `Status` | integer | `0` = Closed, `1` = Open/Normal, `2` = Service alert/disruption |

---

## Status Code Mapping

```typescript
function mapFerryStatus(code: number): 'open' | 'alert' | 'closed' | 'unknown' {
  if (code === 0) return 'closed';
  if (code === 1) return 'open';
  if (code === 2) return 'alert';
  return 'unknown';
}
```

---

## Gotchas

### CORS — Must Proxy Through Backend

> **CRITICAL:** The endpoint does NOT include `Access-Control-Allow-Origin` headers.
> Direct `fetch()` calls from a browser will be blocked by CORS policy.
> You MUST proxy through a backend server.

Example Express proxy route:

```typescript
// server/src/routes/ferry-status.ts
import { Router } from 'express';

const router = Router();
const FERRY_LOCATION_ID = 3789;

router.get('/', async (_req, res) => {
  const upstream = await fetch('https://www.toronto.ca/data/parks/live/ferry.json', {
    headers: { 'User-Agent': 'toronto-ferry-tracker/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  const data = await upstream.json();
  const asset = (data.assets as any[]).find(a => a.LocationID === FERRY_LOCATION_ID);

  if (!asset) {
    res.status(503).json({ error: 'Ferry status unavailable' });
    return;
  }

  res.set('Cache-Control', 'public, max-age=60');
  res.json(normalise(asset));
});
```

### PostedDate Is Naive Eastern Time

`PostedDate` has no timezone suffix (e.g., `"2026-04-03 20:57:57"`). Parsing with `new Date(str)` interprets it as UTC, giving a result that is 4–5 hours wrong.

```typescript
// WRONG — treats as UTC:
new Date("2026-04-03 20:57:57")

// RIGHT — append timezone offset manually:
const utcDate = new Date(asset.PostedDate.replace(' ', 'T') + '-05:00').toISOString();
// Use -04:00 during EDT (summer, mid-March to early November)
// Use -05:00 during EST (winter)
// Or use a date-fns-tz / Luxon / Temporal library for proper tz-aware parsing
```

### Comments Field Contains HTML

The `Comments` string may contain inline HTML (`<b>`, `<br>`, etc.). Strip tags before displaying in a plain-text or non-HTML context:

```typescript
const message = asset.Comments
  ? asset.Comments.replace(/<[^>]+>/g, '').trim()
  : null;
```

---

## Polling & Caching

- The City's own widget polls every **30 seconds**
- For a backend proxy with response caching, **60 seconds** is reasonable
- Set `Cache-Control: public, max-age=60` on your proxy response
- During active incidents, City-side updates typically appear every few minutes

---

## Related Endpoints

| URL | Description |
|---|---|
| `https://www.toronto.ca/data/parks/live/skate.json` | Skating rinks — same schema, different `LocationID` values |
| `https://ckan0.cf.opendata.inter.prod-toronto.ca/datastore/dump/0da005de-270d-49d1-b45b-32e2e777a381` | Ferry ticket throughput (Open Data) — hourly ticket counts, NOT operational status |

---

## What Does NOT Exist

Save future developers time — these were investigated and confirmed absent:

- **No GTFS-RT service alerts** for the ferry. TTC GTFS-RT covers subway/bus/streetcar only. The ferry is operated by Toronto Parks, not TTC.
- **No RSS feed** for ferry disruptions.
- **No 311 JSON endpoint** for parks service advisories.
- **No official documented API.** `ferry.json` is undocumented but has been stable in production use. Treat it as best-effort.
- **No WebSocket or push feed.** Poll only.

---

## Full Normalisation Example

```typescript
interface FerryStatus {
  locationId: number;
  assetName: string;
  status: 'open' | 'alert' | 'closed' | 'unknown';
  reason: string | null;
  message: string | null;
  postedAt: string | null; // ISO 8601 UTC string
  seasonStart: string | null;
  seasonEnd: string | null;
}

function normalise(asset: any): FerryStatus {
  return {
    locationId: asset.LocationID,
    assetName: asset.AssetName,
    status: mapFerryStatus(asset.Status),
    reason: asset.Reason ?? null,
    message: asset.Comments
      ? asset.Comments.replace(/<[^>]+>/g, '').trim()
      : null,
    postedAt: asset.PostedDate
      ? parseEasternNaive(asset.PostedDate)
      : null,
    seasonStart: asset.SeasonStart ?? null,
    seasonEnd: asset.SeasonEnd ?? null,
  };
}

function mapFerryStatus(code: number): 'open' | 'alert' | 'closed' | 'unknown' {
  if (code === 0) return 'closed';
  if (code === 1) return 'open';
  if (code === 2) return 'alert';
  return 'unknown';
}

function parseEasternNaive(naive: string): string {
  // naive = "YYYY-MM-DD HH:mm:ss", Eastern Time, no tz suffix
  // Approximation: use -05:00 (EST). For production use a tz library.
  return new Date(naive.replace(' ', 'T') + '-05:00').toISOString();
}
```

---

## Project Usage Notes

Used in **Toronto Island Ferry Tracker v2** (`project-hammer`):
- Proxied via `server/src/routes/weather.ts` (or a dedicated `ferry-status.ts` route)
- Frontend polls via `useAISStream` or a separate `useFerryStatus` hook
- `LocationID 3789` is the only relevant record; all others are discarded at the proxy layer
