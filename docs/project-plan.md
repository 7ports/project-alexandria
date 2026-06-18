# Project Plan: Alexandria Interactive 3D Embedding Visualizer

> **Status:** Implementation plan — design only, no code. Feeds `@agent-scrum-master` for task decomposition.
> **Author:** project-planner agent · **Date:** 2026-06-18
> **Builds on:** `.voltron/research/vectordb-visualizers-github-pages.md` (candidate comparison + verified data-layer facts).
> **Locked decisions (do not re-litigate):** 3D `scatter3d` (Plotly.js) · doc/chunk granularity toggle · algorithmic-cluster / curated-tag color toggle · in-browser live semantic search (Transformers.js, gated).

---

## Overview

Add a second page to Alexandria's GitHub Pages site — `docs/explore.html` — that renders the knowledge base's embedding space as an **interactive 3D scatter plot** (Plotly.js `scatter3d`). Each point is a guide (doc-centroid, default) or a chunk (toggle); points can be colored by **algorithmic cluster** or by a **curated tag** (toggle); and an optional, button-gated **live semantic search** embeds the visitor's query in-browser (Transformers.js, same `bge-small-en-v1.5` model the MCP server uses) and highlights the nearest points. All dimensionality reduction and clustering happen **offline at build time**; the browser only ever fetches small static JSON/binary artifacts. The existing card view (`index.html`) is untouched — this is purely additive.

This is a **small-N** problem (~41 guides / low-hundreds of chunks), which keeps every payload tiny and lets us favor determinism (precomputed layout) over in-browser compute.

---

## Tech Stack

| Decision | Choice | Rationale | Alternatives considered |
|---|---|---|---|
| **Render library** | **Plotly.js `scatter3d`** (gl3d partial bundle, v3.x, MIT) | Locked. Native 3D orbit/zoom, hover tooltips, legend-driven category toggling, `plotly_click`, `restyle` for live recoloring/highlighting — near-zero custom GL code | regl-scatterplot (2D-only — excluded by 3D lock), Three.js (bespoke, high effort), deck.gl, Embedding Projector (archived 2026-04) |
| **Plotly delivery** | gl3d partial bundle via CDN, pinned + SRI | gl3d bundle ≈ 450 KB gzip vs ~1.2 MB full; we only need 3D scatter | Full `plotly.js-dist-min` (heavier), vendored copy in `docs/` (manual updates) |
| **Dimensionality reduction** | **umap-js 1.4.0** (Node, MIT) | Keeps reduction in the existing JS/Node sync pipeline — no Python ML stack; best cluster structure at small N; seedable for deterministic layouts | Python `umap-learn` (better spectral init but adds a heavy CI Python dep), PCA (deterministic baseline, weaker structure), t-SNE (no stable global layout) |
| **Clustering** | **k-means** via `ml-kmeans` (Node, MIT), k chosen by silhouette over k∈[4,10] | Pure-JS, deterministic with fixed seed, fits the Node pipeline; silhouette picks k objectively | HDBSCAN (no maintained JS lib → would force Python), fixed k = taxonomy size (less principled) |
| **Live query embedding** | **Transformers.js `@huggingface/transformers` 3.x**, `Xenova/bge-small-en-v1.5` (Apache-2.0 model) | Locked. Identical 384-dim model to the MCP server (`embedder.js`) → query vectors are directly comparable to shipped guide vectors; runs fully in-browser, no backend | Hosted embedding API (violates no-backend constraint), ship a smaller model (mismatched vector space) |
| **Transformers.js delivery** | Lazy ESM import from CDN (esm.sh / jsDelivr), **only on "Enable search" click** | The ~120 MB model + WASM/WebGPU runtime must never load on first paint | Bundle eagerly (huge first paint), self-host model weights in repo (bloats git) |
| **Similarity metric** | Cosine via dot product (vectors are L2-normalized) | Matches `index-store.js` (`score = 1 − d²/2` on normalized vecs); dot product of normalized vectors = cosine | Euclidean (equivalent post-normalization, less direct) |
| **Search data payload** | Doc-centroid 384-dim vectors as a compact **Float32 binary** (`.bin`, fetched as ArrayBuffer); chunk vectors optional, lazy | 41×384×4 ≈ 63 KB (doc); a JSON number array would be ~4× larger. Binary keeps it tiny | JSON float arrays (bigger), int8/scalar quantization (unnecessary at this N; adds dequant code) |
| **Reduction trigger** | Extend `scripts/sync-docs.sh` → new `scripts/build-embedding-map.mjs`; artifacts **committed** to repo | The index DB is a gitignored, rebuildable cache; rebuilding it in CI means downloading the 120 MB model + re-embedding. Committing deterministic artifacts avoids that; CI adds a `--check` drift guard | Generate in CI only (forces model download in CI), manual-only regeneration (drift risk) |
| **Page placement** | New `docs/explore.html`, linked from `index.html` nav + CTA | Keeps the working card view intact; additive and independently shippable | Inline into `index.html` (couples concerns, bloats the landing page) |
| **New dependencies live in** | `mcp-server/package.json` (build-time deps: `umap-js`, `ml-kmeans`) | The only existing Node package manifest; the reduction script reads the sqlite-vec index that already lives under `mcp-server/` | New root `package.json` (extra manifest to maintain) — viable if the team prefers build tooling separated from the server |

**Versions & licenses (verified):** Plotly.js 3.x — MIT · umap-js 1.4.0 — MIT (dep `ml-levenberg-marquardt`) · ml-kmeans 6.x — MIT · `@huggingface/transformers` 3.6.x — Apache-2.0 · `bge-small-en-v1.5` model — MIT/Apache-2.0. All client libraries are MIT/Apache-2.0 and CDN-deliverable with SRI.

---

## Architecture

### Components

1. **Build-time reducer** (`scripts/build-embedding-map.mjs`, Node ESM) — reads the sqlite-vec index (`mcp-server/.index/knowledge.db`) via the existing `index-store` primitives, aggregates chunk vectors to doc centroids, runs UMAP→3D for both granularities, runs k-means for cluster ids, joins curated tags from guide front-matter, and writes the static artifacts under `docs/data/`.
2. **Static data artifacts** (`docs/data/*.json` + `*.bin`) — committed; served verbatim by Pages.
3. **Explore page** (`docs/explore.html`) — vanilla JS (matches the site's no-framework convention): fetches the map JSON, builds the Plotly `scatter3d` trace(s), wires the granularity toggle, color-by toggle, hover tooltip, and click-through.
4. **Live search module** (inline in `explore.html`, lazy) — on "Enable search", dynamically imports Transformers.js, loads the model, embeds the query with the `query: ` prefix, computes cosine vs. the shipped vectors, and highlights/ranks nearest points via Plotly `restyle`.

### Data-flow / pipeline diagram (3D · dual-toggle · live search)

```
                         BUILD TIME  (Node ESM, run locally → artifacts committed; CI = drift check)
 ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 │ guides/*.md  ──(front-matter tags:)──┐                                                      │
 │                                      │                                                      │
 │ mcp-server/.index/knowledge.db       │   scripts/build-embedding-map.mjs                    │
 │  (vec0 vec_chunks: rowid,            │        │                                             │
 │   embedding FLOAT[384])  ────────────┼────────┤ read all chunk vectors + chunk→guide join   │
 │                                      │        ▼                                             │
 │                                      │   [chunk vecs 384d] ──► doc centroid                 │
 │                                      │        │               (mean of L2-normalized        │
 │                                      │        │                chunk vecs, re-normalized)    │
 │                                      │        ├──────────────┬──────────────┐               │
 │                                      │        ▼              ▼              ▼               │
 │                                      │   UMAP 384→3      UMAP 384→3     k-means(k*)          │
 │                                      │   (doc points)    (chunk points)  per granularity    │
 │                                      │        │              │              │ cluster ids    │
 │                                      │        └──────┬───────┴──────────────┘               │
 │                                      │  curated tag ─┤ (from front-matter)                   │
 │                                      ▼               ▼                                       │
 │   WRITE  docs/data/embedding-map.json   (coords + metadata, doc & chunk)                    │
 │   WRITE  docs/data/guide-vectors.bin    (Float32 doc-centroid 384d vectors ~63 KB)          │
 │   WRITE  docs/data/chunk-vectors.bin     (optional, lazy — chunk 384d vectors)              │
 └───────────────────────────────────────────────────────────────────┬────────────────────────┘
                                                                       │  committed to repo
                         GITHUB PAGES  (static serve, Jekyll via Actions)
 ┌───────────────────────────────────────────────────────────────────▼────────────────────────┐
 │ docs/explore.html  (vanilla JS)                                                              │
 │   fetch('./data/embedding-map.json')                                                         │
 │        │                                                                                     │
 │        ▼                                                                                     │
 │   Plotly.newPlot(scatter3d)                                                                  │
 │     • orbit / zoom / pan (native)                                                            │
 │     • hover → tooltip (title + tag + cluster)        [hovertemplate / customdata]            │
 │     • click → window.location = './guides/'+guide    [plotly_click]                          │
 │     • GRANULARITY toggle  doc ⇄ chunk   → swap coordinate set (restyle/newPlot)              │
 │     • COLOR-BY toggle     cluster ⇄ tag → recolor marker.color (restyle)                     │
 │                                                                                              │
 │   [ Enable search ] ──(click)──► dynamic import Transformers.js (CDN)                        │
 │        │  load bge-small-en-v1.5 (~120 MB, on demand)                                        │
 │        ▼                                                                                     │
 │   fetch('./data/guide-vectors.bin') → Float32Array                                           │
 │   embedQuery('query: '+q) → 384d → cosine vs shipped vecs → rank → highlight nearest points  │
 └─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Integration points & non-functional requirements

- **No backend / no CORS:** every fetch is same-origin static asset.
- **First paint budget:** `embedding-map.json` (tens of KB) + Plotly gl3d (~450 KB gz). Transformers.js + model load **only** behind the gate.
- **Determinism:** UMAP and k-means seeded with a fixed PRNG seed so re-runs produce a stable layout (clean diffs, no churn). The seed is a constant in the build script.
- **Vector-space consistency:** doc-centroid vectors shipped for search are derived from the *same* `passage:`-prefixed chunk embeddings; the browser must embed queries with the `query: ` prefix (per `embedder.js`) to stay in-distribution.
- **Accessibility/perf fallback:** if WebGL/WebGPU is unavailable, Plotly gl3d degrades poorly — show a feature-detect message; search button stays disabled if `navigator.gpu`/WASM unsupported.

---

## Data Models

All artifacts live under `docs/data/`. Coordinates are precomputed; raw 384-dim vectors ship **only** in the `.bin` files (and only for search).

```typescript
/** docs/data/embedding-map.json — the single map document the page fetches on load. */
interface EmbeddingMap {
  schemaVersion: 1;
  model: "Xenova/bge-small-en-v1.5";
  dim: 384;
  generatedFrom: { guides: number; chunks: number };   // provenance counts
  umap: { seed: number; nNeighbors: number; minDist: number };
  clustering: { algo: "kmeans"; k: number; chosenBy: "silhouette" };
  tags: TagDef[];                                       // taxonomy legend (color order)
  docs: DocPoint[];                                     // ~41 — default granularity
  chunks: ChunkPoint[];                                 // ~hundreds — toggle granularity
}

interface TagDef {
  id: string;        // e.g. "mcp-server"  (kebab-case, matches front-matter `tags:`)
  label: string;     // e.g. "MCP Server"  (display)
  color: string;     // stable hex assigned at build time
}

interface DocPoint {
  id: string;            // guide slug == manifest `name` (e.g. "vector-db-options")
  title: string;         // guide H1 / front-matter title
  url: string;           // "./guides/vector-db-options.md"  (relative, click target)
  tag: string;           // curated TagDef.id (single primary tag)
  cluster: number;       // k-means cluster id for the DOC granularity
  pos: [number, number, number];   // UMAP 3D coords (doc centroid)
  chunkCount: number;    // how many chunks rolled into this centroid
  vecIndex: number;      // row index into guide-vectors.bin (for live search)
}

interface ChunkPoint {
  id: string;            // `${guide}#${chunkIndex}`
  guide: string;         // parent DocPoint.id  (chunk → guide reference)
  title: string;         // parent guide title
  heading: string;       // chunks.heading_path (context in tooltip)
  url: string;           // "./guides/<guide>.md"  (click opens parent guide)
  tag: string;           // inherited from parent guide
  cluster: number;       // k-means cluster id for the CHUNK granularity
  pos: [number, number, number];   // UMAP 3D coords (chunk vector)
  vecIndex: number;      // row index into chunk-vectors.bin (lazy, for chunk-search)
}
```

```typescript
/**
 * docs/data/guide-vectors.bin — raw Float32 doc-centroid vectors for live search.
 * Layout: contiguous little-endian Float32, row-major [nDocs][384]; row r aligns to
 * the DocPoint whose vecIndex === r. Size ≈ 41 × 384 × 4 ≈ 63 KB.
 * docs/data/chunk-vectors.bin — same layout for chunks (optional, lazy-loaded only
 * when search runs against chunk granularity). Vectors are already L2-normalized,
 * so cosine = dot product.
 */
type GuideVectorsBin = ArrayBuffer; // decode → new Float32Array(buf)

/** In-browser search result (not persisted). */
interface SearchHit {
  pointId: string;   // DocPoint.id or ChunkPoint.id
  score: number;     // cosine similarity in [-1,1]
  rank: number;
}
```

**Why two files (JSON + bin):** the JSON is small enough to fetch on every page load and holds everything the *static* map needs; the comparatively larger raw vectors are isolated in a binary that only downloads when the visitor opts into search — keeping first paint cheap.

---

## Tag Taxonomy (build prerequisite)

> ⚠️ **PROPOSED — needs human sign-off.** Tag-coloring cannot ship until `tags:` are backfilled into front-matter. The 41 guides currently all have `tags: []`. This is a **hard prerequisite** for the color-by-tag toggle (algorithmic-cluster coloring has no such dependency and can ship first).

A small **controlled, single-primary** taxonomy (one tag per guide) derived from the existing 41 guides' subject areas. Single-primary keeps the legend readable and maps cleanly to one categorical color per point. Proposed set (11 tags):

| Tag id | Label | Guides (proposed assignment) |
|---|---|---|
| `mcp-server` | MCP Server | alexandria-mcp-server, claude-preview-mcp-server, coplay-mcp-server, fetch-mcp-server, firebase-mcp-server, git-mcp-server, github-mcp-server, memory-mcp-server, trello-mcp-server |
| `claude-agents` | Claude & Agents | claude-code-github-actions, claude-in-chrome, project-voltron, project-voltron-docker |
| `frontend-web` | Frontend & Web | maplibre-react-map-gl, maplibre-vessel-animation, vite-dev-proxy, vite-plugin-pwa, sse-server-sent-events, express-5-node-typescript |
| `cloud-iac` | Cloud & IaC | aws-cli, terraform-aws-ec2, terraform-aws-frontend-hosting |
| `deployment-ci` | Deployment & CI/CD | flyio-deployment, github-actions-ec2-deploy, github-pages-jekyll-actions |
| `data-apis` | Data APIs | aisstream-io, environment-canada-weather-api, toronto-city-open-data-ferry |
| `ai-ml` | AI / ML | embeddings-local-vs-hosted, vector-db-options |
| `observability` | Observability | loki-grafana-stack, prometheus-grafana-docker-compose |
| `testing` | Testing | supertest, vitest |
| `languages-build` | Languages & Build | go-stringer, r-windows-setup, unity-asmdef-assembly-csharp-reference |
| `dev-tooling` | Dev Tooling | beads, github-cli, npm-publish-2fa-tokens, rancher-desktop-windows |

Counts: 9 + 4 + 6 + 3 + 3 + 3 + 2 + 2 + 2 + 3 + 4 = **41** ✓ (full partition).

**Backfill mechanism (script-assisted, human-reviewed):**
- Ship the mapping above as a single source-of-truth table consumed by a one-shot helper (`scripts/backfill-tags.mjs`) that rewrites each guide's `tags:` line in front-matter. Use inline flow style — `tags: [mcp-server]` — which the existing `gen_manifest.py` parser treats as an opaque scalar (it only reads `title`/`summary`), so the manifest output is unchanged.
- A human reviews the per-guide assignment **before** the rewrite is committed (taxonomy is editorial, not algorithmic). The build reducer then reads `tags:` straight from front-matter — no second source of truth.
- The taxonomy `TagDef` list (ids, labels, stable colors) is emitted into `embedding-map.json` so the page legend and colors stay in sync with the build.

---

## Folder Structure

New/changed paths only (everything else untouched):

```
project-alexandria/
  docs/
    index.html              # CHANGED: add "Explore Map" link in nav + a CTA button
    explore.html            # NEW: Plotly scatter3d page + toggles + gated live search (vanilla JS)
    data/                   # NEW: committed build artifacts served by Pages
      embedding-map.json    #   coords + metadata for doc & chunk points + tag legend
      guide-vectors.bin     #   Float32 doc-centroid 384d vectors (live search)
      chunk-vectors.bin     #   Float32 chunk 384d vectors (optional, lazy)
  scripts/
    sync-docs.sh            # CHANGED: after gen_manifest, invoke build-embedding-map.mjs
    build-embedding-map.mjs # NEW: read index → UMAP + k-means → write docs/data/*
    backfill-tags.mjs       # NEW: one-shot front-matter tag writer (taxonomy prerequisite)
  mcp-server/
    package.json            # CHANGED: add build-time deps umap-js, ml-kmeans
  guides/*.md               # CHANGED (one-time): tags: [...] backfilled per taxonomy
  .github/workflows/        # CHANGED: add a build/drift-check step before Jekyll build
```

**Reasoning:** `docs/data/` colocates artifacts with the page that fetches them (same-origin, simple relative paths). The reducer lives in `scripts/` alongside the existing `sync-docs.sh` so the whole "regenerate derived docs" story is one place. Build-time npm deps go in `mcp-server/package.json` because that package already owns the sqlite-vec index code the reducer reuses.

---

## Implementation Roadmap

Milestone-level phases (the scrum-master decomposes these into agent tasks — this plan does **not**).

### Phase 1 — Build pipeline & data artifacts
- **Goal:** Produce committed, deterministic 3D coordinate + cluster data for both granularities.
- **Deliverables:** `umap-js` + `ml-kmeans` added to `mcp-server/package.json`; `scripts/build-embedding-map.mjs` reading the index, computing doc centroids, UMAP→3D (doc + chunk), seeded k-means with silhouette-chosen k; `docs/data/embedding-map.json` + `guide-vectors.bin` (+ optional `chunk-vectors.bin`) generated and committed; schema matches the Data Models section.
- **Dependencies:** A populated `mcp-server/.index/knowledge.db` (rebuildable from guides).
- **Key decisions (human input):** confirm Node/umap-js over Python; confirm k-selection (silhouette vs fixed); confirm committing artifacts vs CI-only.

### Phase 2 — Tag taxonomy backfill (prerequisite for tag-coloring)
- **Goal:** Every guide carries exactly one curated tag in front-matter.
- **Deliverables:** Human-approved taxonomy; `scripts/backfill-tags.mjs`; `tags: [...]` written into all 41 guides; reducer reads tags into `embedding-map.json`.
- **Dependencies:** Human sign-off on the proposed taxonomy table above.
- **Key decisions (human input):** approve/adjust the 11-tag set and per-guide assignment. **Can run in parallel with Phase 1** but must complete before Phase 3's tag toggle is meaningful.

### Phase 3 — Explore page (static map + toggles)
- **Goal:** A working `docs/explore.html` rendering the 3D map with both toggles.
- **Deliverables:** Plotly gl3d (CDN, pinned + SRI) scatter3d; hover tooltip (title/tag/cluster); click→open guide; granularity toggle (doc⇄chunk); color-by toggle (cluster⇄tag); legend; nav link + CTA added to `index.html`.
- **Dependencies:** Phase 1 (data); Phase 2 (for the tag-color path — cluster-color path works without it).
- **Key decisions (human input):** Plotly partial-bundle source (CDN vs vendored).

### Phase 4 — Live semantic search (gated)
- **Goal:** Button-gated in-browser query → highlight nearest points.
- **Deliverables:** "Enable search" gate; lazy Transformers.js import; `bge-small-en-v1.5` load with progress UI; `query:`-prefixed embedding; cosine vs `guide-vectors.bin`; nearest-point highlight + ranked list via `restyle`; WebGPU/WASM feature-detect fallback; works against the active granularity.
- **Dependencies:** Phase 1 (`*.bin` vectors); Phase 3 (page + plot to highlight into).
- **Key decisions (human input):** accept the ~120 MB on-demand model download UX; doc-only search vs also lazy-loading chunk vectors.

### Phase 5 — Build hook & CI integration
- **Goal:** Keep artifacts current and drift-free.
- **Deliverables:** `sync-docs.sh` calls `build-embedding-map.mjs` after manifest gen; a GitHub Actions step runs the reducer in `--check` mode (fails if committed artifacts are stale) before the Jekyll build; docs on regeneration workflow.
- **Dependencies:** Phases 1–2.
- **Key decisions (human input):** CI drift-check vs full regeneration in CI (regeneration needs the 120 MB model in CI — the plan recommends commit-then-check).

---

## Build prerequisites (explicit)

1. **Tag backfill must precede tag-coloring.** The color-by-tag toggle (Phase 3) is non-functional until Phase 2 writes `tags:` into front-matter. Cluster-coloring has no such dependency and can ship first.
2. **New npm deps touch repo tooling.** `umap-js` and `ml-kmeans` are added to `mcp-server/package.json` (build-time). This is the existing Node manifest and owns the sqlite-vec index code; if the team prefers, a separate root `package.json` for build tooling is an acceptable alternative (call out in review).
3. **A populated index is required to build artifacts.** `mcp-server/.index/knowledge.db` is gitignored and rebuildable from the markdown — the reducer needs it present (built locally) since the plan commits artifacts rather than regenerating them in CI.
4. **Vector-space prefix discipline.** Live search must embed queries with the `query: ` prefix (per `embedder.js`); the shipped vectors are `passage:`-prefixed doc centroids — mixing prefixes degrades relevance.

---

## Open Questions (need human input)

1. **k-selection:** silhouette-auto k vs a fixed k pinned to the taxonomy size? (Plan recommends silhouette.)
2. **Chunk-search payload:** ship `chunk-vectors.bin` (few hundred KB, lazy) so search works at chunk granularity, or restrict live search to doc centroids? (Plan: doc-only first, chunk lazy as a follow-up.)
3. **Taxonomy approval:** confirm the 11-tag set and per-guide assignment, or adjust labels/buckets (esp. the `dev-tooling` / `languages-build` grab-bags).
4. **Artifact policy:** commit `docs/data/*` (recommended) vs regenerate in CI (requires the 120 MB model in CI).
5. **Build deps location:** `mcp-server/package.json` (recommended) vs a new root build `package.json`.
6. **Plotly bundle source:** pinned CDN gl3d partial (recommended, with SRI) vs vendored copy in `docs/`.

> **Note (Alexandria):** the `mcp__alexandria__*` tools were not invoked in this container. Reusable, non-project-specific findings (Plotly gl3d partial-bundle sizing, umap-js determinism/seeding, Transformers.js lazy-load + `query:`/`passage:` prefix discipline) should be recorded to Alexandria from the host later, per the project's content-boundary rule. Project-specific decisions stay in this plan / CLAUDE.md.

---

*Plan document only — no implementation, no task breakdown. Next: a human resolves the open questions, then `@agent-scrum-master` decomposes these phases into agent tasks.*
</content>
</invoke>
