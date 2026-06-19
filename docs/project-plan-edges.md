# Project Plan Addendum: Map-as-Hero + Relational Edges

> **Status:** Design addendum — design only, no code. Extends the SHIPPED 3D embedding visualizer (PR #2).
> **Author:** project-planner agent · **Date:** 2026-06-19
> **Builds on:** `docs/project-plan.md` (original design), `docs/explore.html` (shipped), `scripts/build-embedding-map.mjs` (shipped reducer), `docs/data/embedding-map.json` (schema v1).
> **Locked intents (do not re-litigate):** (1) embed the interactive 3D map as a landing-page hero in `docs/index.html`, rendering on page load, with `docs/explore.html` kept as the full-screen standalone; (2) render relational edges between guide nodes with a three-way toggle — **Off / k-NN / Threshold** — both edge sets computed offline at build time.
> **Consulted Alexandria guides:** `client-side-embedding-visualizer`, `transformers-js-browser-embeddings`.

---

## Overview

Two additive enhancements to the existing visualizer, neither of which changes the shipped data contract destructively (schema bumps to v2, backward-readable):

1. **Map as landing-page hero.** Embed the 3D `scatter3d` map near the top of `docs/index.html`, above the guide-card grid, rendering on load. To avoid duplicating ~360 lines of plotting logic across two pages, the map logic is extracted into a shared, build-step-free ES module `docs/assets/embedding-map.js` that both `index.html` and `explore.html` import. The landing embed is a **simplified** instance (granularity + color + the new edges toggle; **no** gated live-search) with an "Open full view ↗" link to `explore.html`.

2. **Relational edges with a toggle.** Both edge sets — **k-NN** (each guide linked to its top-K most similar guides) and **similarity-threshold** (any two guides above a cosine cutoff) — are computed **offline** in `scripts/build-embedding-map.mjs` from the L2-normalized doc-centroid vectors and emitted into `embedding-map.json`. The browser renders the selected set as a single null-separated `scatter3d` line underlay beneath the markers, swapped via `Plotly.react`. Edges are **doc-granularity only** and auto-hidden in chunk mode.

A measured finding drives the threshold design: the shipped `bge-small-en-v1.5` doc centroids are **anisotropic** — all 903 guide pairs score cosine ∈ [0.806, 0.971] (median 0.900). An absolute threshold below ~0.90 connects every node. This is documented in Performance notes and shapes the recommended default.

---

## Decision Table

| Decision | Choice | Rationale | Alternatives considered |
|---|---|---|---|
| **Code reuse across the two pages** | Extract `docs/assets/embedding-map.js` (native ESM, first-party, no bundler) exporting `initEmbeddingMap(opts)`; both pages import it | Single source of truth for plot/toggle logic; no drift; honours the "no frontend build step" constraint | Duplicate the IIFE into `index.html` (drift, double-maintenance — rejected); add a bundler/Vite step (violates no-build constraint — rejected) |
| **Plotly delivery (unchanged)** | Keep the pinned `plotly-gl3d-3.0.1` CDN `<script>` + SRI on **both** pages; module reads `window.Plotly` | Plotly stays a global; SRI only applies to the third-party CDN file; the first-party module needs no SRI | Import Plotly as ESM (no official SRI-pinned ESM partial bundle — rejected) |
| **Hero feature scope** | **Simplified** embed: granularity + color + **edges** toggles; **no** live-search on the landing page; "Open full view ↗" → `explore.html` | Keeps first paint lean and the landing page uncluttered; never tempts the 120 MB model download on the home page; search remains a deliberate, gated action on the standalone | Full-featured hero incl. search (heavier, clutters landing — rejected); static teaser image (loses interactivity — rejected) |
| **Hero mobile (<600px)** | Replace the interactive canvas with a lightweight CTA card linking to `explore.html` | Avoids 3D scroll-trap (canvas captures drag) and WebGL cost on phones; reuses the WebGL-absent fallback path | Always render interactive (scroll-trap, battery — rejected); hide entirely on mobile (loses the entry point — rejected) |
| **WebGL-absent fallback (landing)** | Hero renders a graceful card; the manifest-card grid below is unaffected (independent fetch) | The two on-load features must not be coupled; a missing GPU must never break guide cards | Block page on WebGL check (couples concerns — rejected) |
| **Edge granularity** | **Doc-only** (43 nodes). Edges hidden + toggle disabled in chunk mode | 643 chunk nodes would yield thousands of edges (visual hairball, payload bloat); guide-to-guide relations are the meaningful unit | Chunk edges (unreadable, large — rejected) |
| **Edge compute location** | Offline in `build-embedding-map.mjs` from doc centroids; cosine = dot product (vectors already L2-normalized) | Matches the "reduce offline, render in-browser" pattern; zero client compute; deterministic, diffable | Compute edges in-browser from `guide-vectors.bin` (needless client work, the `.bin` only loads behind search — rejected) |
| **k-NN default K** | **K = 4** → 130 undirected edges, avg degree 6.0, no isolated nodes | Measured on the 43 live nodes (see Performance); K=4 is the lowest K that keeps the graph readable yet connected; K=3 is sparse (99 edges), K≥6 hairballs | K=3 (sparse), K=6/8 (cluttered) — both reported, K=4 recommended |
| **Threshold default** | Percentile-derived: keep the **top ~12% strongest pairs** → cutoff cosine ≈ **0.934**, ~108 edges; persist the resolved absolute cutoff in `edges.meta` | Anisotropy makes a fixed absolute cosine fragile across rebuilds; a percentile auto-adapts to the corpus while the persisted cutoff stays transparent and reviewable | Fixed absolute τ=0.93 (simpler but corpus-fragile — offered as Open Question); τ<0.90 (complete graph — rejected) |
| **Edge render primitive** | Single `scatter3d` line trace, **null-separated segments**, drawn as an underlay (trace index 0), `hoverinfo:'skip'`, `showlegend:false` | One trace = one cheap `restyle`/`react`; null separators draw N disjoint segments in a single GL object; no per-edge hover noise | One trace per edge (hundreds of traces, slow — rejected) |
| **Edge toggle swap** | `Plotly.react` with the edge trace prepended/omitted; toggle states Off / kNN / Threshold mirror the existing segmented-control pattern | `react` already drives the granularity/color toggles; reuse the same render path | `restyle` only (works but `react` is already the page's render primitive — keep one path) |
| **Edge styling** | Uniform subtle line: `rgba(139,148,158,0.22)`, width 1.5 (v1). Weight-tiered opacity (2–3 buckets) deferred as polish | Plotly cannot vary color/opacity per segment within one line trace; uniform keeps it to one trace; tiering = a few extra traces, optional | Per-segment color (not supported by Plotly line traces — rejected) |
| **Schema version** | Bump `schemaVersion` 1 → **2**; `edges` is additive; the page tolerates its absence | Backward-readable; old/new artifacts both parse; clean migration | Silent extension at v1 (loses provenance — rejected) |
| **Determinism** | Canonical edge ordering: `s < t`, sorted by `(s, t)`; weights rounded to 3 decimals; kNN symmetrized to an undirected union | Stable byte output → clean diffs → the existing `--check` drift guard keeps working unchanged | Unsorted/directed edges (diff churn — rejected) |

---

## Architecture

### A. Landing-page hero embed + code reuse

```
                docs/assets/embedding-map.js   (NEW — native ESM, first-party, no bundler)
                ┌──────────────────────────────────────────────────────────┐
                │ export function initEmbeddingMap(opts)                     │
                │   opts = {                                                 │
                │     mount, statusEl, controlsEl, ...   // DOM hooks        │
                │     features: { search, edges },        // capability gates │
                │     heightMode: 'hero' | 'full',                           │
                │     dataUrl: './data/embedding-map.json'                   │
                │   }                                                        │
                │   • hasWebGL() guard → fallback card on miss               │
                │   • fetch map JSON → buildTraces() → window.Plotly.react   │
                │   • wires granularity / color / EDGES toggles              │
                │   • search wired ONLY when features.search === true        │
                └───────────────┬───────────────────────────┬──────────────┘
                                │ import (type="module")     │ import
              ┌─────────────────▼───────────┐   ┌────────────▼────────────────┐
              │ docs/index.html (CHANGED)   │   │ docs/explore.html (CHANGED) │
              │  <section class="map-hero"> │   │  full-screen standalone     │
              │   initEmbeddingMap({        │   │  initEmbeddingMap({         │
              │     heightMode:'hero',      │   │    heightMode:'full',       │
              │     features:{search:false, │   │    features:{search:true,   │
              │              edges:true}})  │   │             edges:true}})   │
              │  + EXISTING manifest-card   │   │                             │
              │    fetch (UNCHANGED)        │   │                             │
              └─────────────────────────────┘   └─────────────────────────────┘
       Plotly gl3d loaded once per page as a pinned CDN <script> + SRI (window.Plotly global)
```

**Coexistence with the existing on-load card render.** `index.html` already runs an IIFE that fetches `./guides/manifest.json` and populates `#guide-grid`. The hero map is a **second, independent** on-load action: its own `fetch('./data/embedding-map.json')`, its own DOM subtree, its own error handling. Neither awaits the other; a failure in one never blocks the other. Placement: a new `<section class="map-hero">` inserted **after** the existing text hero (brand + CTA) and **before** `<section class="concept">` / `<section class="guides">` — i.e. the map sits high on the page, above the guide-card grid, satisfying the "hero" intent without displacing the brand headline or the card grid logic.

**Sizing.** Hero canvas height `clamp(380px, 56vh, 620px)`; full standalone keeps its current `72vh / min 480px`. The module's `heightMode` selects the container class so CSS owns the sizing (no inline pixel math).

**Responsive / mobile.** Plotly runs with `responsive:true`; the module attaches a debounced resize handler. Below the existing 600px breakpoint the hero swaps the interactive canvas for a CTA card ("Explore the 3D map →" linking to `explore.html`) — this dodges the 3D **scroll-trap** (a WebGL canvas captures touch-drag, fighting page scroll) and the GPU/battery cost on phones. The same card markup is reused for the WebGL-absent fallback.

**WebGL-absent fallback (landing).** The module's `hasWebGL()` (already in `explore.html`) gates the hero; on miss it shows the CTA/fallback card instead of a broken canvas. The manifest-card grid below renders regardless.

### B. Edge pipeline (build → data → render)

```
 BUILD  scripts/build-embedding-map.mjs (CHANGED)
   docCentroids[43][384]  (already L2-normalized; cosine = dot product)
        │
        ├─ k-NN:  for each i, top-K by dot(i,·) → directed → symmetrize to undirected union
        │           default K=4 → 130 edges
        ├─ Threshold: all C(43,2)=903 pairs; keep top p% (default 12%) → cutoff≈0.934 → ~108 edges
        │           persist resolved absolute cutoff in edges.meta
        └─ canonicalize: s<t, sort (s,t), w=round(cos,3)
        ▼
   WRITE docs/data/embedding-map.json  (schemaVersion: 2, + edges:{knn,threshold,meta})
        │  (guide-vectors.bin / chunk-vectors.bin UNCHANGED)
        ▼
 RENDER docs/assets/embedding-map.js
   edge state ∈ { off, knn, threshold }
   selected set → x/y/z null-separated arrays from docs[s].pos / docs[t].pos
   → single scatter3d line trace (underlay, index 0) → Plotly.react
   chunk granularity → edge trace omitted + edges toggle disabled
```

`edges[].s` / `.t` index into `docs[]` by array position. Because the reducer emits `docs` in sorted-id order with `vecIndex === i`, the edge index equals both the array index and `vecIndex` — one unambiguous addressing scheme.

---

## Data Models

Additions to the `EmbeddingMap` interface (schema v2). Everything else in `embedding-map.json` is unchanged; `guide-vectors.bin` / `chunk-vectors.bin` are untouched.

```typescript
interface EmbeddingMap {
  schemaVersion: 2;                 // bumped from 1; `edges` is additive
  // …unchanged: model, dim, generatedFrom, umap, clustering, tags, docs, chunks…
  edges: EdgeSets;                  // NEW
}

/** Precomputed relational edge sets over the DOC nodes (docs[] indices). */
interface EdgeSets {
  knn: Edge[];                      // undirected union of per-node top-K
  threshold: Edge[];                // undirected pairs above the resolved cutoff
  meta: EdgeMeta;                   // provenance + tuning params (transparency)
}

/** An undirected edge between two DOC nodes. s < t (canonical). */
interface Edge {
  s: number;   // source: index into docs[]  (== docs[s].vecIndex)
  t: number;   // target: index into docs[]  (== docs[t].vecIndex), s < t
  w: number;   // cosine similarity in [0,1], rounded to 3 decimals
}

interface EdgeMeta {
  knn: { k: number; count: number };                 // e.g. { k: 4, count: 130 }
  threshold: {
    mode: "percentile" | "absolute";                 // how the cutoff was chosen
    percentile?: number;                             // e.g. 0.12 (top 12% of pairs)
    cutoff: number;                                  // resolved absolute cosine cutoff, e.g. 0.934
    count: number;                                   // e.g. 108
  };
  nodes: number;                                     // 43 — edges reference docs only
  cosineRange: [number, number];                     // observed [min,max], e.g. [0.806, 0.971]
}
```

**Why indices, not ids:** numeric `s`/`t` keep the payload tiny and map directly to the in-memory `docs[]` the renderer already holds. ~264 edges × `{s,t,w}` ≈ **7–8 KB** of JSON (vs the existing 287 KB map — negligible; see Performance).

---

## Build-pipeline Changes (`scripts/build-embedding-map.mjs`)

What the reducer must additionally emit (no change to vectors, UMAP, k-means, or `--check` mechanics — `--check` byte-compares the new JSON automatically):

1. **New constants:** `KNN_K = 4`, `EDGE_THRESHOLD_MODE = 'percentile'`, `EDGE_THRESHOLD_PERCENTILE = 0.12`, `EDGE_W_PRECISION = 3`.
2. **Cosine matrix over `docCentroids`** (43×43) via dot product — vectors are already L2-normalized at read time.
3. **k-NN set:** for each node `i`, take indices of the top-`K` by cosine (exclude self); add edge `(min(i,j), max(i,j))` to a `Set` keyed `"s-t"` (symmetric union — a node may end up with degree > K if it is a chosen neighbour of others).
4. **Threshold set:** collect all `C(43,2)` pair cosines; sort desc; keep the top `percentile` fraction; record the cutoff = the cosine of the last kept pair. (Absolute mode = keep pairs `≥ cutoff` constant — supported but not the default.)
5. **Canonicalize & sort** both sets: ensure `s < t`, sort by `(s, t)`, round `w` to 3 decimals → stable, diff-clean byte output.
6. **Emit** `edges: { knn, threshold, meta }` and bump `schemaVersion` to `2`. Log line gains `edges(knn=…, thr=…@cos≥…)`.

No new npm dependencies — this is pure arithmetic over data the script already loads.

---

## Render / UX Design

### Hero (landing page)
- New `<section class="map-hero">` directly under the text hero; container width matches the page; height `clamp(380px, 56vh, 620px)`.
- Simplified control bar: **Granularity** (Guides / Chunks), **Color by** (Cluster / Tag), **Edges** (Off / kNN / Threshold), and a right-aligned **"Open full view ↗"** link to `explore.html`. No search bar.
- Below 600px (or WebGL absent): a CTA card replaces the canvas.

### Edge toggle (both pages)
- A third segmented control matching the existing `.seg` styling: **Off · kNN · Threshold**, default **Off** (so first paint is unchanged and uncluttered).
- On change, the module rebuilds the single line trace's coordinate arrays from the selected `edges.knn` / `edges.threshold` set:
  - `x = [docs[s].pos[0], docs[t].pos[0], null, …]` (and y, z) — null breaks the line between segments.
  - Trace: `{ type:'scatter3d', mode:'lines', line:{ color:'rgba(139,148,158,0.22)', width:1.5 }, hoverinfo:'skip', showlegend:false }`, inserted as trace index 0 so markers draw on top.
  - `Plotly.react` re-renders; selecting **Off** omits the trace.
- **Chunk-mode interaction:** when granularity = chunk, the edge trace is omitted and the Edges control is disabled/greyed with a tooltip ("Edges are guide-level"). Switching back to Guides restores the last edge selection.
- **Search coexistence (explore.html only):** the edge underlay and the amber "search match" ring trace are independent traces; they layer without conflict.
- **Optional polish (deferred):** bucket edges into 2–3 weight tiers (e.g. cos 0.90–0.93 / 0.93–0.95 / >0.95) rendered as separate line traces with rising opacity, to hint relationship strength — costs only a couple of extra traces.

---

## Performance Notes (measured on the 43 live doc centroids)

Cosine distribution over all **903** guide pairs (from `docs/data/guide-vectors.bin`):

| Stat | Value |
|---|---|
| min / median / max | **0.806 / 0.900 / 0.971** |
| p25 / p75 / p90 / p95 | 0.882 / 0.920 / 0.937 / 0.946 |

**Anisotropy finding (drives the threshold default):** every pair already scores ≥ 0.806, so any absolute threshold below ~0.90 produces the **complete graph** (903 edges). Meaningful thresholds live in [0.90, 0.97].

k-NN undirected union edge counts:

| K | Edges | Avg degree |
|---|---|---|
| 3 | 99 | 4.6 |
| **4 (default)** | **130** | **6.0** |
| 5 | 160 | 7.4 |
| 6 | 187 | 8.7 |
| 8 | 252 | 11.7 |

Threshold edge counts (absolute and percentile, real range):

| Cutoff cos | Edges | Avg degree | | Top-p% | Edges | Cutoff cos |
|---|---|---|---|---|---|---|
| 0.92 | 224 | 10.4 | | 5% | 45 | 0.948 |
| 0.93 | 134 | 6.2 | | 8% | 72 | 0.940 |
| 0.94 | 71 | 3.3 | | **12% (default)** | **~108** | **≈0.934** |
| 0.95 | 40 | 1.9 | | 15% | 135 | 0.930 |

**Payload:** worst case (kNN K=4 ⇒ 130 + threshold ⇒ ~135) ≈ **265 edges**. At ~28 bytes/edge JSON ≈ **~7.5 KB**, i.e. **+2.6%** on the 287 KB `embedding-map.json`. Negligible.

**Render cost:** both edge sets render as a **single** `scatter3d` line trace of ≤ ~270 segments (≤ ~810 vertices incl. null separators) — trivial for WebGL; one `Plotly.react` per toggle. No measurable first-paint impact (the edge toggle defaults to Off; edges build lazily on first selection).

---

## Implementation Roadmap

Milestone-level phases (the scrum-master decomposes these into agent tasks — this addendum does **not**).

### Phase A — Edge computation in the build reducer
- **Goal:** `embedding-map.json` carries deterministic `edges.knn` + `edges.threshold` + `edges.meta`; schema → v2.
- **Deliverables:** cosine-over-centroids, kNN (K=4) symmetric union, percentile threshold (top 12%, cutoff persisted), canonical sort + 3-dp weights, schema bump, log line; `--check` parity holds.
- **Dependencies:** none beyond the existing populated index.
- **Key decisions (human input):** confirm K=4; confirm percentile-vs-absolute threshold and the 12% / 0.93 value.

### Phase B — Extract the shared map module
- **Goal:** `docs/assets/embedding-map.js` exporting `initEmbeddingMap(opts)`; `explore.html` refactored to consume it with **behaviour parity** (all current toggles + gated search intact).
- **Deliverables:** the module; `explore.html` reduced to markup + a `type="module"` import + `initEmbeddingMap({heightMode:'full', features:{search:true, edges:true}})`.
- **Dependencies:** none (can run parallel to A); edge wiring lands in C.
- **Key decisions (human input):** confirm native-ESM-no-bundler approach and the `opts` surface.

### Phase C — Edge rendering + toggle
- **Goal:** Off / kNN / Threshold toggle renders the line underlay; chunk-mode disables edges.
- **Deliverables:** edge trace builder, third segmented control, `Plotly.react` swap, chunk-mode disable, styling per spec.
- **Dependencies:** A (edge data) + B (module).
- **Key decisions (human input):** default-Off confirmed; uniform vs weight-tiered styling for v1 (recommend uniform).

### Phase D — Landing-page hero embed
- **Goal:** Interactive map renders on `index.html` load, above the guide-card grid, without breaking the manifest cards.
- **Deliverables:** `<section class="map-hero">` + hero CSS (`clamp` height); `initEmbeddingMap({heightMode:'hero', features:{search:false, edges:true}})`; mobile (<600px) + WebGL-absent CTA-card fallback; "Open full view ↗" link; Plotly CDN `<script>`+SRI added to `index.html`.
- **Dependencies:** B (module); ideally C so the hero ships with edges.
- **Key decisions (human input):** confirm simplified (no-search) hero; confirm exact placement band.

### Phase E — Polish & docs (optional)
- **Goal:** Strength-aware edges + refreshed guides.
- **Deliverables:** weight-tiered edge opacity; update the two Alexandria guides (edge-precompute pattern, anisotropy/threshold caveat, shared-module reuse pattern); note schema v2 in any data-contract docs.
- **Dependencies:** A–D.
- **Key decisions (human input):** ship tiering now or defer.

---

## Open Questions (need human input)

1. **k-NN K:** accept **K=4** (130 edges, avg deg 6.0), or prefer K=3 (sparser) / K=5 (denser)?
2. **Threshold strategy:** percentile-derived **top 12%** (cutoff ≈ 0.934, ~108 edges; corpus-adaptive) — recommended — **or** a fixed absolute **τ=0.93** (134 edges; simpler, transparent, but fragile under corpus drift given the anisotropy)?
3. **Hero scope:** confirm the **simplified** hero (no live-search on the landing page) with an "Open full view" link — or should the hero be full-featured incl. search?
4. **Hero placement:** a dedicated map band **between the text hero and the "How It Works" section** (recommended) vs replacing/merging into the existing text hero?
5. **Mobile behaviour:** swap to a CTA card below 600px (recommended, avoids scroll-trap) vs always-interactive vs hidden?
6. **Edge styling v1:** uniform subtle lines (recommended) vs ship weight-tiered opacity immediately?
7. **Schema bump:** confirm `schemaVersion` → **2** (additive, backward-readable) is acceptable for any external consumers of `embedding-map.json`.

---

*Design addendum only — no implementation, no task breakdown. Next: a human resolves the open questions, then `@agent-scrum-master` decomposes these phases into agent tasks.*
</content>
</invoke>
