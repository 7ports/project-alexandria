import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { require, tmpDbPath, rmDb, rmFile } from './helpers.js';

const { openIndex, knn, close } = require('../lib/index-store.js');
const { embedQuery } = require('../lib/embedder.js');
const { writeKnowledge, readKnowledge, listKnowledge } = require('../lib/knowledge.js');

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

describe('writeKnowledge / readKnowledge / listKnowledge', () => {
  it('writes the markdown source-of-record, embeds chunks, and is readable + listable', async () => {
    const slug = `__vitest_knowledge_${process.pid}`;
    const absPath = path.join(REPO_ROOT, 'guides', `${slug}.md`);
    const dbPath = tmpDbPath();
    const store = openIndex(dbPath);
    cleanup.push(() => rmFile(absPath));
    cleanup.push(() => {
      close(store);
      rmDb(dbPath);
    });

    const result = await writeKnowledge(
      {
        name: slug,
        type: 'guide',
        content:
          '## Quick Reference\n\n```bash\nkubectl apply -f deploy.yaml\n```\n\n## Notes\n\nKubernetes deploys manifests to a cluster.',
        metadata: { title: 'Kube Notes', summary: 'Deploy manifests with kubectl.' },
      },
      { store, noGit: true } // noGit: no commit/push side effects in tests
    );

    // 1. Source-of-record written to guides/.
    expect(result.path).toBe(`guides/${slug}.md`);
    expect(fs.existsSync(absPath)).toBe(true);
    // noGit → no commit enqueued.
    expect(result.committed).toBe(false);

    // 2. Embed-on-write produced chunks in the index.
    expect(result.chunks).toBeGreaterThan(0);

    // The written file round-trips through the frontmatter composer.
    const onDisk = fs.readFileSync(absPath, 'utf-8');
    expect(onDisk).toContain(`id: ${slug}`);
    expect(onDisk).toContain('type: guide');
    expect(onDisk).toContain('summary: Deploy manifests with kubectl.');

    // 3. readKnowledge returns the full doc (and raw strips frontmatter).
    const full = await readKnowledge({ id: slug, type: 'guide' });
    expect(full).toContain('Kubernetes deploys manifests');
    const raw = await readKnowledge({ id: slug, type: 'guide', raw: true });
    expect(raw).not.toContain('id: ');
    expect(raw).toContain('Kubernetes deploys manifests');

    // 4. listKnowledge surfaces the doc line.
    const listed = listKnowledge({ type: 'guide' });
    expect(listed.some((line) => line.startsWith(`${slug} — Kube Notes [guide]`))).toBe(true);

    // 5. The embedded chunks are actually queryable in the index.
    const hits = knn(store, await embedQuery('how to deploy with kubectl'), { top_k: 5 });
    expect(hits.some((h) => h.doc_id === slug)).toBe(true);
  });

  it('returns null from readKnowledge for a missing doc', async () => {
    const missing = await readKnowledge({ id: `__vitest_missing_${process.pid}`, type: 'guide' });
    expect(missing).toBeNull();
  });
});
