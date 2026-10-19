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

const fs = require('fs');
const path = require('path');
const { recordEmbedLatency } = require('./metrics-hooks');
const { selectOnnxBackend } = require('./onnx-backend');

// 384-dim, higher MTEB than all-MiniLM at the same dimensionality.
const MODEL_ID = 'Xenova/bge-small-en-v1.5';
const EMBEDDING_DIM = 384;

// Pin the model cache to an absolute, gitignored dir so the ~120 MB download
// persists across runs (and for later tasks). __dirname is mcp-server/lib.
const MODELS_DIR = path.resolve(__dirname, '..', '.models');

/**
 * Why the model is never handed to onnxruntime as a path:
 *
 * With Transformers.js's own file cache (`env.useFSCache`), Node gets the model's PATH and
 * onnxruntime opens the file itself, with a share mode that denies writers. On Windows any
 * other handle on the file then fails the load with "system error number 13": on a cold
 * cache that is Transformers.js's own unawaited write-stream close, and then antivirus
 * scanning the fresh ~130 MB file, for longer than any sensible retry (7.5 s of backoff
 * still failed in CI). Node's own reads share with everyone, so the model is instead read
 * through Node and passed to onnxruntime as a buffer, which costs one transient copy of
 * the model in memory while the session is built.
 *
 * With `useFSCache` off Transformers.js reads `<localModelPath>/<model>/<file>` (a warm
 * cache) and otherwise downloads, but caches nothing. This custom cache fills that gap: it
 * persists each download to the same layout before the load continues, awaiting the close
 * and renaming into place so a crash never leaves a truncated model behind. `match` misses
 * on purpose, since the local-path read already serves cached files.
 */
const modelCache = {
  async match() {
    return undefined;
  },

  /**
   * @param {string} key - the remote URL, `<host>/<model>/resolve/<revision>/<file>`
   * @param {Response} response
   */
  async put(key, response) {
    const m = /^\/(.+?)\/resolve\/main\/(.+)$/.exec(new URL(key).pathname);
    if (!m) return; // another revision: leave it uncached rather than shadow `main`
    const dest = path.resolve(MODELS_DIR, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (!dest.startsWith(MODELS_DIR + path.sep)) return;

    const tmp = `${dest}.${process.pid}.tmp`;
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fs.promises.writeFile(tmp, Buffer.from(await response.arrayBuffer()));
      await fs.promises.rename(tmp, dest);
    } catch (err) {
      await fs.promises.rm(tmp, { force: true });
      throw err; // Transformers.js logs it and carries on with the downloaded buffer
    }
  },
};

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

    // Configure the cache BEFORE building the pipeline so the downloaded model
    // lands under mcp-server/.models and is reused on subsequent runs.
    env.localModelPath = MODELS_DIR;
    // Allow fetching from the HF hub on first run; reuse the local cache after.
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    // Load the model as a buffer, never a path (see modelCache above).
    env.useFSCache = false;
    env.useCustomCache = true;
    env.customCache = modelCache;

    return pipeline('feature-extraction', MODEL_ID);
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
