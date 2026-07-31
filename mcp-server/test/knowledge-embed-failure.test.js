import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { require, tmpDbPath, rmDb, rmFile } from './helpers.js';

const { openIndex, knn, close } = require('../lib/index-store.js');
const { writeKnowledge } = require('../lib/knowledge.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    const fn = cleanup.pop();
    try {
      fn();
    } catch {
      /* best-effort */
    }
  }
});

describe('writeKnowledge — embed-on-write failure is loud and truthful', () => {
  it('keeps the durable disk write, does NOT report success, and propagates the original error', async () => {
    const slug = `__vitest_embed_fail_${process.pid}`;
    const absPath = path.join(REPO_ROOT, 'guides', `${slug}.md`);
    const dbPath = tmpDbPath();
    const store = openIndex(dbPath);
    cleanup.push(() => rmFile(absPath));
    cleanup.push(() => {
      close(store);
      rmDb(dbPath);
    });

    // Reproduce the environment-specific throw the desktop host hits (transformers.js
    // / onnx pipeline load or native sqlite bindings) without a live model load.
    const EMBED_ERR = 'onnxruntime: failed to load model (simulated host failure)';

    const result = await writeKnowledge(
      {
        name: slug,
        type: 'guide',
        content:
          '## Notes\n\nThis document has real body text that would normally yield chunks.',
        metadata: { title: 'Embed Fail', summary: 'A body that would chunk under a healthy embedder.' },
      },
      {
        store,
        noGit: true, // no commit/push side effects in tests
        embedPassage: async () => {
          throw new Error(EMBED_ERR);
        },
      }
    );

    // 1. The durable write survives — markdown is the source-of-record and must
    //    still be on disk even though indexing failed.
    expect(fs.existsSync(absPath)).toBe(true);
    const onDisk = fs.readFileSync(absPath, 'utf-8');
    expect(onDisk).toContain(`id: ${slug}`);
    expect(onDisk).toContain('type: guide');

    // 2. The result does NOT present as a plain success: the failure is observable.
    expect(result.indexed).toBe(false);
    expect(result.chunks).toBe(0);
    expect(result.embed_error).toBeTruthy();

    // 3. The ORIGINAL error message is propagated verbatim, not a generic string.
    expect(result.embed_error).toBe(EMBED_ERR);

    // 4. The failure is genuine absence from the index — nothing was upserted, so
    //    the doc is not queryable (mirrors the measured host behaviour).
    const hits = knn(store, new Array(384).fill(0), { top_k: 5 });
    expect(hits.some((h) => h.doc_id === slug)).toBe(false);
  });
});
