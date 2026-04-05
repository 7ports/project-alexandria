# Environment Canada Weather API (GeoMet OGC API)

## Overview

Environment Canada exposes real-time surface weather observations (SWOB) through the MSC GeoMet OGC API at `https://api.weather.gc.ca/`. No API key is required — it is a public Government of Canada service.

## Chosen Endpoint: SWOB Realtime

```
https://api.weather.gc.ca/collections/swob-realtime/items?bbox=-79.42,43.61,-79.37,43.64&limit=1&f=json
```

This returns a GeoJSON `FeatureCollection` containing the most recent surface weather observation from **Billy Bishop Toronto City Airport (CYTZ)**.

### Why this endpoint

- `swob-realtime` is the only collection that provides current (sub-hourly) surface observations.
- Filtering by bounding box (`bbox`) is the most reliable way to pin the query to CYTZ — the `icao_stn_id=CYTZ` and `stn_nam=TORONTO+ISLAND` query parameters returned zero results in testing (April 2026), even though the station exists in the data.
- The bbox `-79.42,43.61,-79.37,43.64` is tight enough to return only CYTZ observations.
- `limit=1` returns the single most-recent observation record.

## Target Station: CYTZ — Billy Bishop Toronto City Airport

| Field | Value |
|---|---|
| ICAO ID | `CYTZ` |
| WMO Synoptic ID | `71265` |
| Climate / MSC ID | `6158359` |
| Lat / Lon | 43.6274°N, 79.3962°W |
| Elevation | 76.8 m |
| Data provider | NAV CANADA |
| Station type | Automated (AWOS) |

This station is the closest official weather observation point to the Toronto Island ferry terminal. It is located at the airport on the Toronto Islands waterfront.

## Response Shape

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "id": "2026-03-06-0500-CYTZ-AUTO-swob.xml",
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-79.3962, 43.6274, 76.8] },
      "properties": {
        "stn_nam-value": "Billy Bishop Toronto City Airpor",
        "icao_stn_id-value": "CYTZ",
        "obs_date_tm": "2026-03-06T05:00:00.000Z",
        "air_temp": 1.4,
        "dwpt_temp": -2.1,
        "rel_hum": 78,
        "mslp": 1023.9,
        "avg_wnd_spd_10m_pst10mts": 20.5,
        "avg_wnd_dir_10m_pst10mts": 77,
        "max_wnd_gst_spd_10m_pst10mts": 31.7,
        "avg_vis_pst10mts": 16.09,
        "prsnt_wx_1": 300
      }
    }
  ],
  "numberMatched": 1503,
  "numberReturned": 1
}
```

### Key property fields

| Property | Description | Units |
|---|---|---|
| `air_temp` | Current air temperature | °C |
| `dwpt_temp` | Dew point temperature | °C |
| `rel_hum` | Relative humidity | % |
| `mslp` | Mean sea level pressure | hPa |
| `stn_pres` | Station pressure | hPa |
| `avg_wnd_spd_10m_pst10mts` | Avg wind speed (10 min avg, 10 m) | km/h |
| `avg_wnd_dir_10m_pst10mts` | Avg wind direction (10 min avg) | degrees |
| `max_wnd_gst_spd_10m_pst10mts` | Max gust speed past 10 min | km/h |
| `avg_vis_pst10mts` | Average visibility past 10 min | km |
| `prsnt_wx_1` | Present weather code (WMO table) | code |
| `obs_date_tm` | Observation timestamp | ISO 8601 UTC |
| `pcpn_amt_pst1hr` | Precipitation past 1 hour | mm |

Note: property names use a `-value` suffix in some fields (e.g. `icao_stn_id-value`) but not others (e.g. `air_temp`). This is inconsistent in the API — the `-value` suffix appears on metadata fields, while numeric observation values omit it.

## Queryable Parameters

Discovered via `https://api.weather.gc.ca/collections/swob-realtime/queryables?f=json`:

- `stn_id`, `stn_nam`, `icao_stn_id`, `wmo_synop_id` — station filters
- `air_temp`, `dwpt_temp`, `rel_hum`, `mslp` — temperature/pressure
- `avg_wnd_spd_10m_pst1hr`, `avg_wnd_dir_10m_pst1hr` — wind (1-hr avg)
- `avg_wnd_spd_10m_pst10mts`, `avg_wnd_dir_10m_pst10mts` — wind (10-min avg)
- `pcpn_amt_pst1hr`, `vis`, `snw_dpth` — precipitation/visibility

## Gotchas

1. **`icao_stn_id` filter does not work** — querying `?icao_stn_id=CYTZ` returns 0 results. Use a bounding box instead.
2. **`stn_nam` filter does not work** — `?stn_nam=TORONTO+ISLAND` also returns 0 results.
3. **`sortby` parameter returns HTTP 400** — do not use `?sortby=-datetime`. The API does not support sorting on this collection.
4. **No API key required** — completely public, no auth headers needed.
5. **Rate limiting** — the `/collections` root endpoint returned HTTP 429 during testing. Prefer direct collection item queries. Cache responses for at least 5 minutes.
6. **Data freshness** — observations are sub-hourly (roughly every 10–30 minutes for CYTZ automated station). A 5-minute cache TTL is appropriate.
7. **`numberMatched`** — returns the total records in the collection (millions), not a filtered count. Don't use it to check whether data exists; check `features.length` instead.
8. **Old observations in results** — without a time filter the API may return observations from days ago. For the ferry tracker use case this is acceptable (the timestamp is in the response), but add a `datetime` filter if freshness is critical: `&datetime=2026-04-05T00:00:00Z/..` (RFC 3339 interval).

## Links

- API root: https://api.weather.gc.ca/
- Collection metadata: https://api.weather.gc.ca/collections/swob-realtime
- Queryables: https://api.weather.gc.ca/collections/swob-realtime/queryables?f=json
- OpenAPI spec: https://api.weather.gc.ca/openapi?f=json
