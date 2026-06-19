---
id: embeddings-local-vs-hosted
type: guide
title: "Local vs Hosted Embeddings for Semantic Search"
summary: >
  Embedding models turn text into dense vectors so you can do semantic similarity search — "find docs that mean the same thing as this query" even when keywords don't match.
tags: [ai-ml]
status: active
created: 2026-06-17
updated: 2026-06-17
embedding_version: 1
---

# Local vs Hosted Embeddings for Semantic Search

## Quick Reference

**Install (local, recommended):**
```bash
npm install @huggingface/transformers
```

**Critical: always use query:/passage: prefixes with bge-small-en-v1.5:**
```js
const { pipeline } = await import('@huggingface/transformers');
const embedder = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');

// Indexing (write path):
const passageEmb = await embedder('passage: ' + chunkText, { pooling: 'mean', normalize: true });

// Query (search path):
const queryEmb = await embedder('query: ' + userQuery, { pooling: 'mean', normalize: true });
```

Omitting the `passage:` / `query:` prefixes measurably degrades recall. This is the single most common mistake with bge-small.

**Model auto-downloads on first call (~120 MB) and caches locally. No API key. No network after that.**

---

## Overview

Embedding models turn text into dense vectors so you can do semantic similarity search — "find docs that mean the same thing as this query" even when keywords don't match. You need an embedding model any time you're building a vector DB, RAG pipeline, or semantic search index.

The choice between local and hosted embeddings matters more than most people expect. The tl;dr: **use local (bge-small-en-v1.5) unless you have a specific reason not to**. The quality gap between bge-small and a hosted API is small for most guide/docs corpora; the operational gap is large.

---

## Decision Matrix

| Situation | Recommendation |
|-----------|----------------|
| Node.js backend, corpus fits in memory | bge-small-en-v1.5 (local) |
| Agent loop writing frequently to a vector DB | bge-small-en-v1.5 — no per-write API cost or latency |
| Offline required, or air-gapped environment | Local only |
| Browser or mobile client that can't bundle 120 MB ONNX | Hosted (OpenAI or Voyage) |
| Highest possible retrieval quality, cost not a concern | OpenAI text-embedding-3-small |
| Code-heavy or multilingual corpus | Voyage voyage-3 or voyage-3-lite |
| Multimodal (text + image) | Cohere embed-v4 |

---

## Local Models

### bge-small-en-v1.5 (recommended)

**Package:** `@huggingface/transformers` (Transformers.js — runs ONNX in-process, no C++ required)
**Model ID:** `Xenova/bge-small-en-v1.5`
**Dimensions:** 384
**Speed:** ~15 ms/1K tokens in-process on a typical dev machine
**Model size:** ~120 MB (downloaded once, cached to HF cache dir)
**Cost:** $0/month
**Network required:** First run only (model download); offline after cache is warm

bge-small-en-v1.5 consistently outperforms all-MiniLM-L6-v2 on MTEB benchmarks at the same 384 dimensions. It is the best local option for English text corpora in Node.js.

The model lazy-loads on the first `pipeline()` call and stays in-process after that. Subsequent calls within the same process are fast with no reload overhead.

**Full indexing + search example:**
```js
import { pipeline } from '@huggingface/transformers';

// Instantiate once at startup — reuse across all embed calls
const embedder = await pipeline('feature-extraction', 'Xenova/bge-small-en-v1.5');

async function embedDocument(text) {
  const output = await embedder('passage: ' + text, { pooling: 'mean', normalize: true });
  return Array.from(output.data); // Float32Array → plain array
}

async function embedQuery(text) {
  const output = await embedder('query: ' + text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
```

**Why the prefixes matter:** bge-small uses asymmetric retrieval — documents and queries have different embedding semantics. The model was trained to expect `passage: <text>` for documents being indexed and `query: <text>` for search queries. Dropping these prefixes silently collapses the asymmetric space and degrades recall. There is no error message; it just returns worse results.

### all-MiniLM-L6-v2

**Package:** `@huggingface/transformers`
**Model ID:** `Xenova/all-MiniLM-L6-v2`
**Dimensions:** 384
**Cost:** $0/month

Same setup and package as bge-small, but lower MTEB quality. Does NOT use `query:`/`passage:` prefixes — it is a symmetric model (same embedding space for documents and queries).

Use all-MiniLM if you're migrating from an existing system that already uses it, or if you have a specific reason to prefer symmetric retrieval.

```js
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
// No prefixes needed:
const emb = await embedder(text, { pooling: 'mean', normalize: true });
```

---

## Hosted APIs

All hosted options require a network call and an API key on every embedding request. This adds latency on the write path and introduces key-management overhead in every environment (dev machine, CI, Docker containers, agent instances).

### OpenAI text-embedding-3-small

**Dimensions:** 1536 (default); can truncate to 512 or 256 via `dimensions` parameter
**Cost:** $0.02/1M tokens ($0.01/1M in batch mode)
**Latency:** Network RTT + queue, typically 100–500 ms per batch

Best balance of quality and cost in the OpenAI lineup. Very strong retrieval quality — noticeably better than bge-small at edge cases, but for a docs/guides corpus the practical difference is often small.

```js
import OpenAI from 'openai';
const openai = new OpenAI();

const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: text,
  // dimensions: 512, // optional — truncate to save storage
});
const embedding = response.data[0].embedding; // length 1536 (or truncated)
```

### Voyage voyage-3-lite / voyage-3

**Dimensions:** 512 (lite) / 1024 (voyage-3)
**Cost:** $0.02/1M tokens (lite); voyage-3 priced higher
**Latency:** Network RTT, similar to OpenAI

Strong on code-heavy and multilingual corpora. A good alternative to OpenAI if your content is mixed English/code or non-English.

### Gemini text-embedding-004

**Dimensions:** 768
**Cost:** $0.15–0.20/1M tokens
**Latency:** Network RTT

Strong multilingual support. Higher cost-per-token than OpenAI or Voyage. Best suited when you're already deep in the Google/Vertex AI ecosystem.

### Cohere embed-v4

**Dimensions:** Variable (float, int8, or binary output modes)
**Cost:** Usage-priced (check Cohere dashboard)

The only option here that handles multimodal input (text + images in the same index). If your corpus includes images alongside text, Cohere is the practical choice.

---

## Key Trade-offs

### Cost

Local is always $0 — including at scale. Hosted APIs are cheap per-token at low volume, but in an agent loop that embeds documents on every write, token costs accumulate and introduce an API-key dependency in every environment that runs the agent.

### Latency on the write path

Local in-process: ~15 ms/1K tokens. Hosted: 100–500 ms per batch (network RTT + server queue). In a continuous embed-on-write pipeline this difference is felt on every document insertion, not just at query time.

### Index storage

384-dimension vectors (bge-small, all-MiniLM) use roughly 1.5 KB per document. 1536-dimension vectors (OpenAI 3-small) use ~6 KB per document — 4× more storage and a larger cosine-similarity computation per query. For small-to-medium corpora this doesn't matter; for millions of documents it does.

### Offline and determinism

Local: works with no internet after the initial model download; vectors for the same input are always identical. Hosted: requires connectivity; results may change if the provider updates the model (even under the same model name).

### Quality

For a guide/docs corpus in English: bge-small-en-v1.5 is close enough to OpenAI 3-small that the operational simplicity of local wins. The gap becomes meaningful on very large corpora, short queries against long documents, or non-English text.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Search results are poor with bge-small | Confirm `passage:` prefix on indexed text and `query:` prefix on queries. Missing prefixes is the most common cause. |
| First embed call is slow (several seconds) | Expected — the ONNX model is downloading and loading. Subsequent calls in the same process are fast. |
| `@huggingface/transformers` fails to load ONNX runtime | Ensure Node.js >= 18. No C++ build tools are needed for Transformers.js. |
| Model re-downloads on every run | HF cache is not persisting. Set `HF_HOME` or `TRANSFORMERS_CACHE` to a stable path (see Platform Notes). |
| `pipeline()` throws in a worker thread | Transformers.js supports worker threads but the model must be loaded inside the worker — you cannot share an `embedder` instance across threads. |
| OpenAI embedding call fails in agent Docker container | Confirm `OPENAI_API_KEY` is passed into the container environment. |
| Dimension mismatch error from vector DB | All vectors in an index must have the same dimension. Switching models requires rebuilding the index from scratch. |

---

## Platform Notes (Windows 10)

**HF cache location:** By default, `@huggingface/transformers` caches the downloaded ONNX model to:
```
%USERPROFILE%\.cache\huggingface\hub
```

**Pin the cache directory** so the model survives Node.js version upgrades and CI runs without re-downloading:

```powershell
# Set in your shell profile or CI environment:
$env:HF_HOME = "C:\Users\<user>\.cache\huggingface"
# or
$env:TRANSFORMERS_CACHE = "C:\Users\<user>\.cache\huggingface\hub"
```

Set this in System Properties > Environment Variables for a permanent machine-wide setting. In CI (GitHub Actions, etc.) pass it as an environment variable in the workflow YAML.

**No C++ compiler needed** for `@huggingface/transformers` — it runs pure-JS ONNX via `onnxruntime-node`, which ships prebuilt binaries. You only need a C++ build toolchain if you're installing `better-sqlite3` or other native addons alongside it.

**First-run download:** The bge-small model is ~120 MB. On a dev machine with a good connection this takes a few seconds. Pre-warm the cache before going offline by running a dummy embed call:

```powershell
node -e "import('@huggingface/transformers').then(({pipeline}) => pipeline('feature-extraction','Xenova/bge-small-en-v1.5').then(e => e('passage: warmup', {pooling:'mean',normalize:true})).then(() => console.log('cache ready')))"
```

**Antivirus scanning:** Windows Defender may scan the ONNX binary on first load, adding 1–3 seconds to the first `pipeline()` call. Adding the HF cache directory to Defender exclusions eliminates this:

```powershell
# Admin PowerShell:
Add-MpPreference -ExclusionPath "$env:USERPROFILE\.cache\huggingface"
```

---

## Related Guides

- `guides/project-voltron-docker.md` — Docker setup for agent environments where embedding models run inside containers

---

## References

- [MTEB Leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — Benchmark scores for embedding models
- [Xenova/bge-small-en-v1.5 on HuggingFace](https://huggingface.co/Xenova/bge-small-en-v1.5)
- [Xenova/all-MiniLM-L6-v2 on HuggingFace](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
- [@huggingface/transformers npm package](https://www.npmjs.com/package/@huggingface/transformers)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Voyage AI Embeddings](https://docs.voyageai.com/docs/embeddings)

---

*Last updated: 2026-06-17*
