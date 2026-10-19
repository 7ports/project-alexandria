/**
 * embedder.js — local text embedding for Alexandria's vector index.
 *
 * Wraps the Transformers.js feature-extraction pipeline with the
 * `Xenova/bge-small-en-v1.5` model (384-dim). The pipeline is created once
 * (lazy singleton) and reused for the lifetime of the process.
 *
 * NOTE: `@huggingface/transformers` is ESM-only. This file is CommonJS
 * (see the local lib/package.json `"type": "commonjs"`), so the library is
 * loaded via dynamic `import()` inside an async function — never top-level
 * `require()`.
 *
 * bge models expect instruction prefixes: documents are embedded with a
 * `passage: ` prefix and search queries with a `query: ` prefix.
 */

const path = require('path');
const { recordEmbedLatency } = require('./metrics-hooks');
const { selectOnnxBackend } = require('./onnx-backend');

// 384-dim, higher MTEB than all-MiniLM at the same dimensionality.
const MODEL_ID = 'Xenova/bge-small-en-v1.5';
const EMBEDDING_DIM = 384;

// Pin the model cache to an absolute, gitignored dir so the ~120 MB download
// persists across runs (and for later tasks). __dirname is mcp-server/lib.
const MODELS_DIR = path.resolve(__dirname, '..', '.models');

// Lazy singletons — the in-flight init promise is cached so concurrent callers
// share a single pipeline rather than racing to download/build the model.
let pipelinePromise = null;

async function getPipeline() {
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    // Before the import: falls back to WebAssembly when the native ONNX binary
    // will not load (see onnx-backend.js).
    selectOnnxBackend();

    // Dynamic import: ESM-only package loaded from a CommonJS module.
    const { pipeline, env } = await import('@huggingface/transformers');

    // Configure cache BEFORE building the pipeline so the downloaded model
    // lands under mcp-server/.models and is reused on subsequent runs.
    env.cacheDir = MODELS_DIR;
    env.localModelPath = MODELS_DIR;
    // Allow fetching from the HF hub on first run; reuse the local cache after.
    env.allowRemoteModels = true;
    env.allowLocalModels = true;

    // On Node, Transformers.js downloads the model, resolves without awaiting the cached
    // file's close, and hands onnxruntime only the path. On a cold Windows cache the native
    // open then hits a sharing violation ("system error number 13") — while the write handle
    // closes, and for seconds longer when antivirus scans the fresh ~130 MB file (a single
    // 500 ms retry still failed in CI). Every write was awaited, so the file is complete;
    // back off and load it from the cache once the handle is released.
    for (const delayMs of [500, 1000, 2000, 4000, 0]) {
      try {
        return await pipeline('feature-extraction', MODEL_ID);
      } catch (err) {
        if (!delayMs || !/system error number 13\b/.test(String(err && err.message))) throw err;
        console.error(`[alexandria] model file still locked after download; retrying in ${delayMs} ms`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  })();

  try {
    return await pipelinePromise;
  } catch (err) {
    // Reset on failure so a later call can retry instead of caching the error.
    pipelinePromise = null;
    throw err;
  }
}

/**
 * Embed `text` with the given bge instruction prefix.
 * Applies mean-pooling + L2 normalization and returns a plain number[].
 * @param {string} prefix - 'passage: ' or 'query: '
 * @param {string} text
 * @returns {Promise<number[]>} length-384 vector
 */
async function embed(prefix, text) {
  const t0 = performance.now();
  const extractor = await getPipeline();
  const output = await extractor(prefix + (text ?? ''), {
    pooling: 'mean',
    normalize: true,
  });

  // `output` is a Tensor; `.data` is a Float32Array of length EMBEDDING_DIM.
  const vector = Array.from(output.data);

  recordEmbedLatency((performance.now() - t0) / 1000);

  if (vector.length !== EMBEDDING_DIM) {
    throw new Error(
      `embedder: expected ${EMBEDDING_DIM}-dim vector, got ${vector.length}`
    );
  }

  return vector;
}

/**
 * Embed a document/passage for storage in the vector index.
 * @param {string} text
 * @returns {Promise<number[]>} length-384 vector
 */
async function embedPassage(text) {
  return embed('passage: ', text);
}

/**
 * Embed a search query.
 * @param {string} text
 * @returns {Promise<number[]>} length-384 vector
 */
async function embedQuery(text) {
  return embed('query: ', text);
}

module.exports = { embedPassage, embedQuery, getOnnxBackend: selectOnnxBackend };
