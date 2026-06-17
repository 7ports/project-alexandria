import { describe, it, expect, afterEach } from 'vitest';
import { require, tmpDbPath, rmDb, unitVec } from './helpers.js';

const { openIndex, upsertDoc, knn, close } = require('../lib/index-store.js');

const dbs = [];
function freshStore() {
  const p = tmpDbPath();
  dbs.push(p);
  return { store: openIndex(p), path: p };
}

afterEach(() => {
  while (dbs.length) rmDb(dbs.pop());
});

describe('index-store', () => {
  it('upserts a doc and returns its nearest neighbour for a close query', () => {
    const { store } = freshStore();

    // Three docs on three orthogonal axes.
    const docs = [
      { id: 'alpha', axis: 0 },
      { id: 'beta', axis: 10 },
      { id: 'gamma', axis: 20 },
    ];
    for (const d of docs) {
      const res = upsertDoc(store, {
        meta: { id: d.id, type: 'guide', title: d.id, content_hash: `h-${d.id}` },
        chunks: [{ heading_path: '', chunk_index: 0, text: d.id, content_hash: `ch-${d.id}` }],
        embeddings: [unitVec(d.axis)],
      });
      expect(res.skipped).toBe(false);
      expect(res.chunks).toBe(1);
    }

    // Query close to beta's axis (one-hot at 10, small blend).
    const hits = knn(store, unitVec(10, 0.05), { top_k: 3 });
    expect(hits.length).toBe(3);
    expect(hits[0].doc_id).toBe('beta');
    // Best-first ordering by score.
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
    expect(hits[1].score).toBeGreaterThanOrEqual(hits[2].score);
    // Cosine-ish score for the (near-)identical vector is close to 1.
    expect(hits[0].score).toBeGreaterThan(0.9);

    close(store);
  });

  it('skips re-embedding a doc whose content_hash is unchanged', () => {
    const { store } = freshStore();

    const payload = {
      meta: { id: 'doc', type: 'guide', title: 'Doc', content_hash: 'stable-hash' },
      chunks: [{ heading_path: '', chunk_index: 0, text: 'hello', content_hash: 'c1' }],
      embeddings: [unitVec(3)],
    };

    const first = upsertDoc(store, payload);
    expect(first.skipped).toBe(false);

    // Same content_hash → skipped, no work done.
    const second = upsertDoc(store, payload);
    expect(second.skipped).toBe(true);

    // Changed content_hash → re-embedded.
    const third = upsertDoc(store, {
      ...payload,
      meta: { ...payload.meta, content_hash: 'new-hash' },
    });
    expect(third.skipped).toBe(false);

    close(store);
  });

  it('honours a type filter in knn', () => {
    const { store } = freshStore();
    upsertDoc(store, {
      meta: { id: 'guide-doc', type: 'guide', title: 'G', content_hash: 'g' },
      chunks: [{ heading_path: '', chunk_index: 0, text: 'g', content_hash: 'cg' }],
      embeddings: [unitVec(0)],
    });
    upsertDoc(store, {
      meta: { id: 'concept-doc', type: 'concept', title: 'C', content_hash: 'c' },
      chunks: [{ heading_path: '', chunk_index: 0, text: 'c', content_hash: 'cc' }],
      embeddings: [unitVec(0, 0.01)],
    });

    const hits = knn(store, unitVec(0), { top_k: 5, type: 'concept' });
    expect(hits.length).toBe(1);
    expect(hits[0].doc_id).toBe('concept-doc');
    expect(hits.every((h) => h.type === 'concept')).toBe(true);

    close(store);
  });
});
