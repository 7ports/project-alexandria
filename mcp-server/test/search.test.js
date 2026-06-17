import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { require, tmpDbPath, rmDb, rmFile } from './helpers.js';

const { openIndex, upsertDoc, close } = require('../lib/index-store.js');
const { embedPassage } = require('../lib/embedder.js');
const { searchKnowledge } = require('../lib/search.js');

// search.js anchors the lexical scan at the repo root (two levels above lib/).
const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('searchKnowledge — semantic mode', () => {
  let dbPath;
  let store;

  const DOCS = [
    {
      id: 'docker-guide',
      type: 'guide',
      title: 'Docker',
      text: 'Use Docker to build and run containers. docker build, docker run, and Dockerfile layers.',
    },
    {
      id: 'weather-api',
      type: 'guide',
      title: 'Weather API',
      text: 'Fetch the current temperature and forecast from the Environment Canada weather API.',
    },
  ];

  beforeAll(async () => {
    dbPath = tmpDbPath();
    store = openIndex(dbPath);
    for (const d of DOCS) {
      const emb = await embedPassage(d.text);
      upsertDoc(store, {
        meta: { id: d.id, type: d.type, title: d.title, content_hash: `h-${d.id}` },
        chunks: [{ heading_path: '', chunk_index: 0, text: d.text, content_hash: `c-${d.id}` }],
        embeddings: [emb],
      });
    }
  });

  afterAll(() => {
    if (store) close(store);
    rmDb(dbPath);
  });

  it('ranks the topically-relevant doc first', async () => {
    const res = await searchKnowledge(store, 'how do I run a container image', { top_k: 5 });
    expect(res.mode).toBe('semantic');
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits[0].doc_id).toBe('docker-guide');
    expect(res.hits[0].snippet).toContain('Docker');
  });

  it('degrades to the lexical fallback when no store is available', async () => {
    // No store + not forced lexical → semantic path throws internally and falls
    // through to the lexical substring scan.
    const res = await searchKnowledge(null, 'docker', { top_k: 5 });
    expect(res.mode).toBe('lexical-fallback');
  });
});

describe('searchKnowledge — forced lexical mode', () => {
  // A unique needle that only our temp fixture contains.
  const NEEDLE = 'zzqqvitestlexicalmarker';
  const slug = `__vitest_lexical_${process.pid}`;
  const fixturePath = path.join(REPO_ROOT, 'guides', `${slug}.md`);

  beforeAll(() => {
    fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
    fs.writeFileSync(
      fixturePath,
      `---\nid: ${slug}\ntype: guide\ntitle: Lexical Fixture\n---\n\n# Lexical Fixture\n\nThe ${NEEDLE} appears here for substring search.\n`,
      'utf-8'
    );
  });

  afterAll(() => rmFile(fixturePath));

  it('finds a substring match over the markdown source-of-record', async () => {
    const res = await searchKnowledge(null, NEEDLE, { lexical: true, top_k: 10 });
    expect(res.mode).toBe('lexical-fallback');
    const hit = res.hits.find((h) => h.doc_id === slug);
    expect(hit).toBeTruthy();
    expect(hit.type).toBe('guide');
    expect(hit.snippet.toLowerCase()).toContain(NEEDLE);
  });

  it('honours a type filter in lexical mode', async () => {
    const res = await searchKnowledge(null, NEEDLE, {
      lexical: true,
      type: 'concept',
      top_k: 10,
    });
    // The fixture is a guide, so a concept-typed filter excludes it.
    expect(res.hits.find((h) => h.doc_id === slug)).toBeUndefined();
  });
});
