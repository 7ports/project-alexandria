/**
 * ort-wasm-shim.mjs — stands in for `onnxruntime-node` when its native binary will not
 * load (see onnx-backend.js, which routes the import here).
 *
 * onnxruntime-web is resolved through Transformers.js rather than from this directory: it is
 * a transitive dependency, so npm may hoist it or nest it, and only Transformers.js is
 * guaranteed to see the copy it was built against.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const requireHere = createRequire(import.meta.url);
const requireFromTransformers = createRequire(requireHere.resolve('@huggingface/transformers'));

// Under Node this resolves to onnxruntime-web's CommonJS node build in dist/.
const webEntry = requireFromTransformers.resolve('onnxruntime-web');
const ort = requireFromTransformers('onnxruntime-web');

// Transformers.js points wasmPaths at a CDN unless it is already set. Serve the .wasm/.mjs
// runtime files from the installed package instead, so embedding works offline.
ort.env.wasm.wasmPaths = pathToFileURL(path.dirname(webEntry) + path.sep).href;

// Transformers.js reads `ONNX_NODE.default ?? ONNX_NODE`; export both shapes.
export const { InferenceSession, Tensor, env } = ort;
export default ort;
