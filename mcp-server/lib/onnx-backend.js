/**
 * onnx-backend.js — choose the ONNX Runtime the embedder runs on.
 *
 * Transformers.js imports `onnxruntime-node` statically, so when that package's prebuilt
 * native binary cannot load, importing Transformers.js throws and the whole embedder —
 * semantic search AND embed-on-write — goes down with it.
 *
 * The case seen in the wild: Windows hosts whose Visual C++ runtime (msvcp140.dll) is older
 * than 14.40. onnxruntime 1.21+ is built with VS 2022 17.10+, whose STL changed std::mutex,
 * and against an older runtime the DLL's static initialisation fails with
 * "A dynamic link library (DLL) initialization routine failed". No export is missing, so
 * nothing short of updating the redistributable makes the native binary load.
 *
 * Rather than leave those hosts without semantic search, this probes the native binding once
 * and, when it will not load, redirects the `onnxruntime-node` import to onnxruntime-web's
 * WebAssembly build (already installed as a Transformers.js dependency) through a module
 * resolve hook. Same model, same vectors — slower, but working. `npm run doctor` still
 * reports the native failure and its remedy.
 *
 * ALEXANDRIA_ONNX_BACKEND=native|wasm forces a choice (native: fail loudly instead of
 * falling back; wasm: skip the native binding even when it loads).
 *
 * Must run before the first import of '@huggingface/transformers' in the process.
 */

const path = require('path');
const nodeModule = require('module');
const { pathToFileURL } = require('url');

const SHIM_URL = pathToFileURL(path.join(__dirname, 'ort-wasm-shim.mjs')).href;

// Lazy singleton: { backend: 'native' | 'wasm', nativeError: Error | null }.
let selected = null;

function firstLine(err) {
  return String((err && err.message) || err).split(/\r?\n/)[0];
}

/** Try to load the native binding; returns the load error, or null when it loads. */
function probeNative() {
  try {
    require('onnxruntime-node');
    return null;
  } catch (err) {
    return err;
  }
}

function selectOnnxBackend() {
  if (selected) return selected;

  const forced = (process.env.ALEXANDRIA_ONNX_BACKEND || '').trim().toLowerCase();
  let nativeError = null;

  if (forced !== 'wasm') {
    nativeError = probeNative();
    if (!nativeError) {
      selected = { backend: 'native', nativeError: null };
      return selected;
    }
    if (forced === 'native') throw nativeError;
  }

  // module.registerHooks (synchronous, in-thread) landed in Node 22.15 / 23.5.
  if (typeof nodeModule.registerHooks !== 'function') {
    throw new Error(
      `onnxruntime-node will not load (${firstLine(nativeError)}) and the WebAssembly `
        + `fallback needs Node >= 22.15; run \`npm run doctor\` in mcp-server/ for the fix`
    );
  }

  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'onnxruntime-node') {
        return { url: SHIM_URL, format: 'module', shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });

  selected = { backend: 'wasm', nativeError };
  if (nativeError) {
    console.error(
      `[alexandria] native onnxruntime unavailable (${firstLine(nativeError)}); embedding `
        + 'with the WebAssembly backend. Run `npm run doctor` in mcp-server/ for the fix.'
    );
  }
  return selected;
}

module.exports = { selectOnnxBackend };
