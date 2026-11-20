import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { require, tmpDbPath, rmDb, rmFile, unitVec } from './helpers.js';

const { listContentFiles } = require('../lib/content.js');
const { openIndex, upsertDoc, knn, close } = require('../lib/index-store.js');
const { reindexAll } = require('../lib/reindex.js');
const { knowledgeHealth, formatHealth } = require('../lib/health.js');
const { resolveIndexPath, MODULE_ROOT } = require('../lib/index-path.js');
const { describeEmbed } = require('../lib/write-report.js');
const { embedQuery } = require('../lib/embedder.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const sha256 = (t) => crypto.createHash('sha256').update(t).digest('hex');

const cleanup = [];
afterEach(() => {
  while (cleanup.length) {
    try {
      cleanup.pop()();
    } catch {
      /* best-effort */
    }
  }
});

function tmpStore() {
  const dbPath = tmpDbPath();
  const store = openIndex(dbPath);
  cleanup.push(() => {
    close(store);
    rmDb(dbPath);
  });
  return store;
}

function tmpTree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alexandria-tree-'));
  cleanup.push(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

function indexRow(store, relPath, body, { type, chunks = 1 } = {}) {
  const id = path.basename(relPath, '.md');
  upsertDoc(store, {
    meta: { id, type, title: id, updated: null, path: relPath, content_hash: sha256(body), embedding_version: 1 },
    chunks: Array.from({ length: chunks }, (_, i) => ({
      heading_path: '', chunk_index: i, text: body, content_hash: sha256(body),
    })),
    embeddings: Array.from({ length: chunks }, (_, i) => unitVec(i)),
  });
}

describe('content walker', () => {
  it('excludes README.md and takes the type from the directory', () => {
    const root = tmpTree({
      'guides/a.md': '# A\n',
      'concepts/README.md': '# concepts/\n',
      'concepts/b.md': '# B (no frontmatter)\n',
      'references/c.md': '---\ntype: guide\n---\n# C mislabeled\n',
    });
    const files = listContentFiles({ repoRoot: root });
    expect(files.map((f) => `${f.relPath}:${f.type}`)).toEqual([
      'guides/a.md:guide',
      'concepts/b.md:concept',
      'references/c.md:reference',
    ]);
  });
});

describe('reindexAll', () => {
  it('indexes a frontmatter-less concepts/ doc as a concept, skips README, and prunes phantom rows', async () => {
    const slug = `__vitest_dirwins_${process.pid}`;
    const abs = path.join(REPO_ROOT, 'concepts', `${slug}.md`);
    fs.writeFileSync(abs, `# Dirwins ${slug}\n\nZebra quokka marmalade lighthouse ${slug}.\n`);
    cleanup.push(() => rmFile(abs));

    const store = tmpStore();
    indexRow(store, 'concepts/__vitest_phantom.md', 'gone', { type: 'concept' });

    const r = await reindexAll(store, { contentDirs: ['concepts'] });
    expect(r.pruned).toBe(1);

    const rows = store.db.prepare('SELECT doc_id, type, path FROM docs').all();
    expect(rows.find((x) => x.doc_id === slug)).toMatchObject({ type: 'concept' });
    expect(rows.some((x) => x.path.endsWith('README.md'))).toBe(false);
    expect(rows.some((x) => x.doc_id === '__vitest_phantom')).toBe(false);

    const hits = knn(store, await embedQuery(`zebra quokka marmalade lighthouse`), { top_k: 3, type: 'concept' });
    expect(hits.map((h) => h.doc_id)).toContain(slug);
  }, 120000);
});

describe('knowledgeHealth', () => {
  it('names every set difference between disk, index, and manifest', () => {
    const root = tmpTree({
      'guides/a.md': '# A\n',
      'guides/stale.md': '# Stale, edited since embed\n',
      'concepts/README.md': '# concepts/\n',
      'concepts/b.md': '# B\n',
      'references/r.md': '# R\n',
      'docs/guides/manifest.json': JSON.stringify([
        { name: 'a', title: 'A', description: '' },
        { name: 'r', type: 'reference', title: 'R', description: '' },
        { name: 'deleted', type: 'concept', title: 'gone', description: '' },
      ]),
    });
    const store = tmpStore();
    indexRow(store, 'guides/a.md', '# A\n', { type: 'guide' });
    indexRow(store, 'guides/stale.md', '# old text\n', { type: 'guide' });
    indexRow(store, 'references/r.md', '# R\n', { type: 'guide' }); // pre-fix typing
    indexRow(store, 'guides/phantom.md', 'x', { type: 'guide' });

    const h = knowledgeHealth(store, { repoRoot: root, syncState: { sync_conflict: true, conflict_file: 'guides/a.md' } });

    expect(h.healthy).toBe(false);
    expect(h.disk).toEqual({ count: 4, by_type: { guide: 2, concept: 1, reference: 1 } });
    expect(h.index.not_indexed).toEqual(['concepts/b.md']);
    expect(h.index.not_on_disk).toEqual(['guides/phantom.md']);
    expect(h.index.stale).toEqual(['guides/stale.md']);
    expect(h.index.mistyped).toEqual(['references/r.md (indexed as guide)']);
    expect(h.manifest.dirty).toBe(true);
    expect(h.manifest.not_in_manifest).toEqual(['concepts/b.md', 'guides/stale.md']);
    expect(h.manifest.not_on_disk).toEqual(['concepts/deleted.md']);
    expect(h.sync.sync_conflict).toBe(true);

    const text = formatHealth(h);
    expect(text).toContain('DRIFT DETECTED');
    expect(text).toContain('concepts/b.md');
  });

  it('reports HEALTHY when disk, index, and manifest agree, and flags an unavailable index', () => {
    const root = tmpTree({
      'guides/a.md': '# A\n',
      'docs/guides/manifest.json': JSON.stringify([{ name: 'a', type: 'guide', title: 'A', description: '' }]),
    });
    const store = tmpStore();
    indexRow(store, 'guides/a.md', '# A\n', { type: 'guide' });
    expect(knowledgeHealth(store, { repoRoot: root, syncState: {} }).healthy).toBe(true);

    const down = knowledgeHealth(null, { repoRoot: root, syncState: {} });
    expect(down.healthy).toBe(false);
    expect(formatHealth(down)).toContain('index: UNAVAILABLE');
  });
});

describe('index-path guard', () => {
  it('anchors relative dirs to mcp-server/, not the process cwd', () => {
    const script = [
      `const p=require(${JSON.stringify(path.join(MODULE_ROOT, 'lib', 'index-path.js'))});`,
      `const s=require(${JSON.stringify(path.join(MODULE_ROOT, 'lib', 'index-store.js'))});`,
      `console.log(JSON.stringify([p.resolveIndexPath({shared:true}), s.DEFAULT_DB_PATH]));`,
    ].join('');
    const run = (cwd) => {
      const r = spawnSync(process.execPath, ['-e', script], { cwd, encoding: 'utf-8' });
      expect(r.status, r.stderr).toBe(0);
      return JSON.parse(r.stdout.trim().split('\n').pop());
    };
    const a = run(os.tmpdir());
    const b = run(REPO_ROOT);
    expect(a).toEqual(b);
    expect(a[0]).toBe(path.join(MODULE_ROOT, '.index', 'knowledge.db'));
    expect(a[1]).toBe(path.join(MODULE_ROOT, '.index', 'knowledge.db'));
  });

  it('refuses index dirs that escape mcp-server/', () => {
    expect(() => resolveIndexPath({ baseDir: '../outside' })).toThrow(/outside the Alexandria server package/);
    expect(() => resolveIndexPath({ baseDir: os.tmpdir() })).toThrow(/outside the Alexandria server package/);
  });
});

describe('write report', () => {
  it('never renders a 0-chunk or failed embed as a plain success', () => {
    expect(describeEmbed({ indexed: true, chunks: 0 })).toMatch(/0 searchable chunks/);
    expect(describeEmbed({ indexed: false, chunks: 0, embed_error: 'boom' })).toMatch(/NOT searchable.*boom/);
    expect(describeEmbed({ indexed: false, chunks: 0 })).toMatch(/NOT searchable/);
    expect(describeEmbed({ indexed: true, chunks: 3 })).toBe('3 chunk(s) embedded');
  });
});
