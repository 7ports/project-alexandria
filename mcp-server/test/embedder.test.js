import { describe, it, expect } from 'vitest';
import { require } from './helpers.js';

const { embedPassage, embedQuery } = require('../lib/embedder.js');

describe('embedder', () => {
  it('embedPassage returns a length-384 normalized vector', async () => {
    const vec = await embedPassage('Project Alexandria stores tooling guides.');
    expect(Array.isArray(vec)).toBe(true);
    expect(vec.length).toBe(384);
    expect(vec.every((x) => typeof x === 'number' && Number.isFinite(x))).toBe(true);
    // L2-normalized → magnitude ≈ 1.
    const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeGreaterThan(0.99);
    expect(norm).toBeLessThan(1.01);
  });

  it('embedQuery returns a length-384 vector and ranks related text higher', async () => {
    const q = await embedQuery('how do I install the widget');
    expect(q.length).toBe(384);

    const related = await embedPassage('Run npm install widget to set up the widget CLI.');
    const unrelated = await embedPassage('The history of medieval cheese-making in France.');

    const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
    // Closer semantic match scores higher.
    expect(dot(q, related)).toBeGreaterThan(dot(q, unrelated));
  });
});
