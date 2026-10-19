import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SERVER_DIR = path.resolve(__dirname, '..');

/**
 * Hosts whose onnxruntime-node binary will not load (Windows with a Visual C++ runtime older
 * than 14.40) used to lose the whole embedder, because Transformers.js imports it statically.
 * CI runners have a current runtime, so the fallback is forced here to keep it exercised.
 *
 * Each case runs in a child process: the resolve hook and the backend choice are process-wide
 * singletons, and this test process may already have loaded the native backend.
 */
function embedInChild(backend) {
  const script = `
    const e = require('./lib/embedder');
    (async () => {
      const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
      const q = await e.embedQuery('how do I install the widget');
      const related = await e.embedPassage('Run npm install widget to set up the widget CLI.');
      const unrelated = await e.embedPassage('The history of medieval cheese-making in France.');
      process.stdout.write(JSON.stringify({
        backend: e.getOnnxBackend().backend,
        dim: q.length,
        norm: Math.sqrt(dot(q, q)),
        related: dot(q, related),
        unrelated: dot(q, unrelated),
      }));
    })().catch((err) => { process.stderr.write(String(err && err.stack)); process.exit(1); });
  `;
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: SERVER_DIR,
    env: { ...process.env, ALEXANDRIA_ONNX_BACKEND: backend },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

describe('onnx backend selection', () => {
  it('embeds through the WebAssembly fallback without the native binding', () => {
    const r = embedInChild('wasm');
    expect(r.backend).toBe('wasm');
    expect(r.dim).toBe(384);
    expect(r.norm).toBeGreaterThan(0.99);
    expect(r.norm).toBeLessThan(1.01);
    expect(r.related).toBeGreaterThan(r.unrelated);
  });
});
