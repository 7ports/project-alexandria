---
id: transformers-js-browser-embeddings
type: guide
title: "Transformers.js — In-Browser Embeddings (No Backend)"
summary: >
  Run a sentence-embedding model entirely in the browser with @huggingface/transformers for live semantic search on a static site, covering lazy gated loading and query/passage prefix discipline.
tags: [ai-ml]
status: active
created: 2026-06-18
updated: 2026-06-18
embedding_version: 1
---

# Transformers.js — In-Browser Embeddings (no backend)

Run a sentence-embedding model **entirely in the browser** with `@huggingface/transformers` (Transformers.js) — useful for live semantic search on a static site with no server. Verified 2026-06 with `@huggingface/transformers@3.6.x` and `Xenova/bge-small-en-v1.5` (384-dim).

## When to use
You ship precomputed document vectors to a static page and want "type a query → find nearest docs" without a backend. The browser embeds the query and compares against the shipped vectors.

## Setup (lazy + gated — important)
The model + WASM/WebGPU runtime is large (bge-small pulls **~120 MB** on first use). **Never load it on page load.** Gate behind an explicit user action:

```js
// only inside a click handler — not a top-level <script>
let embedder;
async function enableSearch() {
  const { pipeline } = await import('https://esm.sh/@huggingface/transformers@3.6.3'); // PIN the version
  embedder = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5',
                            { progress_callback: showProgress });
}
```
- Pin the version in the import URL (not `@latest`) for reproducibility + cache stability.
- Show a progress indicator during model download.

## Prefix discipline (BGE / E5 family) — easy to get wrong
These models were trained with **asymmetric prefixes**. You MUST match how the corpus was embedded:
- Documents/passages embedded with `"passage: " + text`
- Queries embedded with `"query: " + text`

Mixing prefixes silently degrades relevance. If your stored vectors were built with `passage:`, embed user queries with `query:`.

```js
const out = await embedder('query: ' + q, { pooling: 'mean', normalize: true });
const vec = out.data; // Float32Array, length 384, L2-normalized
```

## Similarity
With `normalize: true`, vectors are L2-normalized, so **cosine = dot product**:
```js
function cosine(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
```
Load the shipped corpus vectors from a `Float32` `.bin` (`new Float32Array(await (await fetch('./vectors.bin')).arrayBuffer())`), slice per row by `vecIndex`, rank by score.

## Feature detection / fallback
Check `('gpu' in navigator)` (WebGPU) and `typeof WebAssembly === 'object'`. If neither, disable the search UI with a note — the model can't run. WebGPU is faster; Transformers.js falls back to WASM automatically.

## Gotchas
- Vector space must match: query embeddings are only comparable to corpus embeddings produced by the **same model + same prefix convention**.
- First query after enable includes model download + warmup latency — surface it.
- esm.sh / jsDelivr both serve Transformers.js as ESM; pin the version and prefer one CDN consistently for cache reuse.
