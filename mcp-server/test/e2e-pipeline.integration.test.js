import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { require, tmpDbPath, rmDb, rmFile } from './helpers.js';
import path from 'path';
import { fileURLToPath } from 'url';

const { writeKnowledge, readKnowledge } = require('../lib/knowledge.js');
const { searchKnowledge, recallContext } = require('../lib/search.js');
const { openIndex, close } = require('../lib/index-store.js');

describe('e2e-pipeline.integration', () => {
  let store = null;
  let dbPath = null;

  beforeAll(() => {
    dbPath = tmpDbPath();
    store = openIndex(dbPath);
  });

  afterAll(() => {
    if (store) close(store);
    if (dbPath) rmDb(dbPath);
    // Clean up guide files written by the test to avoid polluting the working tree.
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(__dirname, '..', '..');
    rmFile(path.join(repoRoot, 'guides', 'widget-redis-cache.md'));
  });

  it('embeds and semantically ranks a distinctive document', async () => {
    // Write a guide about Redis caching for widgets — a distinctive topic
    const result = await writeKnowledge(
      {
        name: 'widget-redis-cache',
        type: 'guide',
        content: `# Configuring Widget Caching with Redis

To improve performance of your Foobar application, the widget subsystem can use Redis for caching results.

## Installation

Install the widget-cache module from npm:

    npm install @example/widget-cache-redis

## Configuration

Add the following to your config.yml:

    cache:
      provider: redis
      host: localhost
      port: 6379

## Cache Invalidation

The cache is invalidated when:

1. The widget configuration changes
2. A new widget definition is loaded
3. The cache TTL expires (default 3600s)

## Performance Tips

- Use Redis Sentinel for high availability
- Monitor cache hit rate with the metrics endpoint
- Consider memory limits to prevent Redis OOM
`,
        metadata: {
          title: 'Widget Caching with Redis',
          summary: 'Configure Redis caching for widget performance',
          tags: ['cache', 'redis', 'performance', 'widgets'],
        },
      },
      { store, noGit: true }
    );

    expect(result.path).toBe('guides/widget-redis-cache.md');
    expect(result.chunks).toBeGreaterThan(0);

    // Now search with a SEMANTICALLY RELATED but NOT KEYWORD-IDENTICAL query
    // "how do I cache widgets" is related to the doc about widget caching but
    // doesn't match words like "redis" or "configuration" exactly.
    const searchResult = await searchKnowledge(store, 'how do I cache widgets efficiently?', {
      top_k: 5,
    });

    expect(searchResult.mode).toBe('semantic');
    expect(searchResult.hits.length).toBeGreaterThan(0);

    // The written doc should be the top result because the embeddings are
    // semantically close, not because of keyword matching.
    const topHit = searchResult.hits[0];
    expect(topHit.doc_id).toBe('widget-redis-cache');
    expect(topHit.type).toBe('guide');
    expect(topHit.title).toBe('Widget Caching with Redis');
    expect(topHit.score).toBeGreaterThan(0.5); // reasonable semantic similarity

    // Later results should score lower (best-first ranking).
    if (searchResult.hits.length > 1) {
      expect(searchResult.hits[0].score).toBeGreaterThanOrEqual(searchResult.hits[1].score);
    }
  }, { timeout: 180_000 }); // First run downloads ~128MB embedder model

  it('recalls context with deduplication (one chunk per doc)', async () => {
    // Recall context should call searchKnowledge and deduplicate by doc_id
    const briefing = await recallContext(store, 'how do I improve widget performance?', {
      top_k: 5,
    });

    expect(Array.isArray(briefing)).toBe(true);
    expect(briefing.length).toBeGreaterThan(0);

    // The written doc should appear in the briefing
    const widgetDoc = briefing.find((b) => b.doc_id === 'widget-redis-cache');
    expect(widgetDoc).toBeDefined();
    expect(widgetDoc.type).toBe('guide');

    // recallContext returns deduplicated results — only one entry per doc.
    // Verify deduplication by checking doc_ids are unique.
    const docIds = briefing.map((b) => b.doc_id);
    const uniqueIds = new Set(docIds);
    expect(uniqueIds.size).toBe(docIds.length);
  }, { timeout: 180_000 });

  it('round-trips the written doc via readKnowledge', async () => {
    // Read back the full markdown
    const markdown = await readKnowledge({ id: 'widget-redis-cache', type: 'guide' });

    expect(markdown).toBeTruthy();
    expect(typeof markdown).toBe('string');

    // Verify it contains the original content
    expect(markdown).toContain('Widget Caching with Redis');
    expect(markdown).toContain('Redis for caching results');
    expect(markdown).toContain('npm install @example/widget-cache-redis');

    // Verify frontmatter is present
    expect(markdown).toContain('---');
    expect(markdown).toContain('type: guide');
    expect(markdown).toContain('id: widget-redis-cache');
  });

  it('returns body only when raw:true', async () => {
    // Read with raw:true strips frontmatter
    const body = await readKnowledge({ id: 'widget-redis-cache', type: 'guide', raw: true });

    expect(body).toBeTruthy();
    expect(typeof body).toBe('string');

    // Should NOT contain frontmatter markers
    expect(body.startsWith('---')).toBe(false);

    // Should contain the body
    expect(body).toContain('Widget Caching with Redis');
    expect(body).toContain('npm install');
  });
});
