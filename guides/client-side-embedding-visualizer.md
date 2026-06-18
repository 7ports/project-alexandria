# Client-Side Embedding Visualizer (static site / GitHub Pages)

How to add an interactive 2D/3D scatter of a vector/embedding space to a **fully static** site (GitHub Pages, S3, any CDN) — no server, no serverless. Verified 2026-06.

## When to use
You have a corpus of documents with high-dimensional embeddings (e.g. from a vector DB) and want visitors to explore clusters / semantic neighborhoods spatially, with hover, click-through, and optional in-browser search. Works best at small-to-medium N (dozens to low-thousands of points).

## Core pattern: reduce OFFLINE, render in-browser
Do all dimensionality reduction + clustering at **build time** and ship small static artifacts. The browser never sees the raw high-dim matrix (except optionally for search). This gives a deterministic layout, instant first paint, and a tiny payload.

```
build time (Node):  vectors[N][D] --UMAP--> coords[N][2or3] --kmeans--> cluster ids
                    --> write embedding-map.json (coords + metadata)
                    --> write vectors.bin (Float32, only if you want in-browser search)
runtime (static):   fetch(embedding-map.json) -> Plotly scatter(3d) -> hover/click/toggles
```

## Render: Plotly.js `scatter`/`scatter3d`
- **Use a partial bundle.** Full `plotly.js` is ~1.2 MB gz; the **`gl3d` partial bundle is ~450 KB gz** and includes `scatter3d` + the API you need. For 2D use `scattergl`.
- **Pin + SRI.** Load from a pinned CDN URL with an `integrity="sha384-…"` attribute and `crossorigin="anonymous"`. Compute the hash from the downloaded bytes (`openssl dgst -sha384 -binary file.js | openssl base64 -A`).
- Native for free: orbit/zoom/pan, hover (`hovertemplate` + `customdata`), legend, `plotly_click` (→ navigate), `Plotly.react`/`restyle` for live toggles & recoloring.
- 2D-only alternative with a smaller, embedding-specific footprint: **regl-scatterplot** (MIT, actively maintained). The TF "Embedding Projector" standalone was **archived 2026-04** — avoid as a long-lived dep.

## Reduce: umap-js (Node, MIT)
- Keeps reduction in a JS/Node build pipeline (no Python ML stack). `nNeighbors≈15`, `minDist≈0.1` are sane defaults.
- **Determinism matters for clean diffs.** UMAP and k-means use RNG; seed them so re-runs produce a stable layout. With `umap-js`, set a fixed seed and reset the global PRNG per build (it reads `Math.random`). Without this, every rebuild reshuffles the map and pollutes git diffs.
- Compute doc-level points as the **mean of L2-normalized member vectors, then re-normalized** (centroid on the unit sphere).

## Cluster: ml-kmeans (Node, MIT)
- Pick `k` objectively with a **silhouette** sweep over a small range (e.g. k∈[4,10]) rather than hardcoding. No maintained JS HDBSCAN exists — if you need density clustering you must drop to Python.

## Optional in-browser live search
See the companion guide **transformers-js-browser-embeddings** — lazy-load the embedder behind a button, embed the query client-side, cosine vs a shipped `Float32` vectors `.bin`, highlight nearest points.

## Data payload tips
- Ship coords + metadata as small JSON; ship raw vectors (for search) as a **contiguous little-endian Float32 `.bin`** (`new Float32Array(arrayBuffer)`), row-major `[N][D]`, with a `vecIndex` per point. A `.bin` is ~4× smaller than a JSON float array. N=41, D=384 → ~63 KB.
- If vectors are L2-normalized, cosine similarity == dot product (cheaper).

## GitHub Pages specifics
- Everything is same-origin static — no CORS concerns for your own `./data/*.json|*.bin`.
- Commit the generated artifacts and add a **CI drift-check** (`--check` mode in your build script that regenerates to memory and byte-compares) so a PR that changes source data without regenerating fails. Regenerating in CI requires the embedding model present (cache it); committing artifacts + checking is usually cheaper than full CI regeneration.

## Gotchas
- WebGL/WebGPU may be unavailable — feature-detect and show a fallback message; keep the search button disabled if WASM/WebGPU absent.
- Keep the visualizer on a separate page (additive) so the existing site is untouched.
