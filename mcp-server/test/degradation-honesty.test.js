import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { require, rmFile } from './helpers.js';

const { recallContext } = require('../lib/search.js');
const { writeKnowledge } = require('../lib/knowledge.js');
const { parseFrontmatter } = require('../lib/frontmatter.js');

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

/**
 * Both cases below were live bugs, and both were invisible: the server kept answering, so the
 * damage only showed up much later as knowledge that could not be found and titles that had
 * silently become slugs. The point of these tests is that a degraded or lossy path must be
 * detectable from the return value alone.
 */

describe('recallContext reports its mode', () => {
  it('reports lexical-fallback when there is no vector index', async () => {
    // store = null is exactly what index.js passes when the native modules failed to load.
    const recalled = await recallContext(null, 'guide', { top_k: 3 });

    expect(recalled).not.toBeInstanceOf(Array); // the old bare-array contract discarded the mode
    expect(recalled.mode).toBe('lexical-fallback');
    expect(Array.isArray(recalled.briefing)).toBe(true);
  });

  it('still reports lexical-fallback when the scan finds nothing', async () => {
    // The dangerous case: zero rows AND a broken index. Callers must be able to tell this apart
    // from an empty corpus instead of asserting "no guide covers this yet".
    const recalled = await recallContext(null, '__no_such_topic_zzzq__', { top_k: 3 });

    expect(recalled.mode).toBe('lexical-fallback');
    expect(recalled.briefing).toHaveLength(0);
  });
});

describe('writeKnowledge preserves existing frontmatter', () => {
  it('keeps title/summary/tags when an update supplies no metadata', async () => {
    const slug = `__vitest_frontmatter_${process.pid}`;
    const absPath = path.join(REPO_ROOT, 'guides', `${slug}.md`);
    cleanup.push(() => rmFile(absPath));

    await writeKnowledge(
      {
        name: slug,
        type: 'guide',
        content: 'Original body.',
        metadata: { title: 'A Real Title', summary: 'Why this exists.', tags: ['alpha', 'beta'] },
      },
      { noGit: true }
    );

    // update_guide edits the body only and passes no metadata. Composing frontmatter from
    // scratch here reduced every title to its slug across the corpus.
    await writeKnowledge({ name: slug, type: 'guide', content: 'Edited body.' }, { noGit: true });

    const { meta, body } = parseFrontmatter(fs.readFileSync(absPath, 'utf-8'), `${slug}.md`);
    expect(meta.title).toBe('A Real Title');
    expect(meta.summary).toBe('Why this exists.');
    expect(meta.tags).toEqual(['alpha', 'beta']);
    expect(body).toContain('Edited body.');
  });

  it('lets caller metadata win field-by-field over what is on disk', async () => {
    const slug = `__vitest_frontmatter_merge_${process.pid}`;
    const absPath = path.join(REPO_ROOT, 'guides', `${slug}.md`);
    cleanup.push(() => rmFile(absPath));

    await writeKnowledge(
      {
        name: slug,
        type: 'guide',
        content: 'Body.',
        metadata: { title: 'Old Title', summary: 'Keep me.' },
      },
      { noGit: true }
    );
    await writeKnowledge(
      { name: slug, type: 'guide', content: 'Body.', metadata: { title: 'New Title' } },
      { noGit: true }
    );

    const { meta } = parseFrontmatter(fs.readFileSync(absPath, 'utf-8'), `${slug}.md`);
    expect(meta.title).toBe('New Title'); // supplied → wins
    expect(meta.summary).toBe('Keep me.'); // not supplied → preserved
  });
});

describe('searchKnowledge separates a requested substring scan from a degraded one', () => {
  const { searchKnowledge } = require('../lib/search.js');

  it('reports lexical (not lexical-fallback) when the caller forces it', async () => {
    // Forcing lexical is a legitimate exact-string lookup. Labelling it a fallback made the
    // server announce "the semantic index is unavailable" while the index was healthy.
    const r = await searchKnowledge(null, 'guide', { lexical: true, top_k: 1 });
    expect(r.mode).toBe('lexical');
  });

  it('reports lexical-fallback when semantic was wanted but unavailable', async () => {
    const r = await searchKnowledge(null, 'guide', { top_k: 1 });
    expect(r.mode).toBe('lexical-fallback');
  });
});
