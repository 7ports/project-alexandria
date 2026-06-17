'use strict';

/**
 * knowledge.js — generalized read/write/list for Alexandria knowledge docs of
 * any type (guide | concept | article | reference). Markdown on disk is the
 * source-of-record; the sqlite-vec index is a derived cache kept correct on
 * every write (embed-on-write).
 *
 * Write ordering (per alexandria-sync-and-boundary-addendum.md → "Write Path"):
 *   1. compose frontmatter+body → write .md to dir(type)     (source-of-record)
 *   2. chunk → embed → upsert into the local index           (read surface now correct)
 *   3. enqueue syncCommitAndPush(relPath, ...)               (async git sync)
 * Step 2 precedes step 3 deliberately: a failed push never costs the local read
 * surface — the doc is visible/queryable locally and propagates on the next sync.
 *
 * CommonJS (see lib/package.json "type":"commonjs"); loaded from the ESM
 * index.js via createRequire.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseFrontmatter } = require('./frontmatter');
const { chunk } = require('./chunker');
const { embedPassage } = require('./embedder');
const { upsertDoc } = require('./index-store');
const { syncCommitAndPush } = require('./git-sync');

// __dirname is mcp-server/lib → repo root is two levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Kept in sync with reindex.js / the frontmatter `embedding_version` default.
const EMBEDDING_VERSION = 1;

const TYPE_DIRS = {
  guide: 'guides',
  concept: 'concepts',
  article: 'articles',
  reference: 'references',
};
const DIR_TYPES = {
  guides: 'guide',
  concepts: 'concept',
  articles: 'article',
  references: 'reference',
};
const CONTENT_DIRS = Object.values(TYPE_DIRS);

function sha256(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text)).digest('hex');
}

function dirForType(type) {
  return TYPE_DIRS[type] || TYPE_DIRS.guide;
}

function typeForDir(dir) {
  return DIR_TYPES[dir] || 'guide';
}

/** Render a single YAML scalar, quoting only when the minimal parser needs it. */
function yamlScalar(v) {
  if (typeof v === 'number') return String(v);
  const s = String(v == null ? '' : v);
  if (s === '') return '""';
  // Quote when the value could be mis-parsed (colons, brackets, commas, quotes,
  // leading/trailing whitespace, or YAML null-ish tokens). JSON quoting is a
  // safe superset that the frontmatter parser's stripQuotes() reverses.
  if (/[:#[\]{}",]|^\s|\s$/.test(s) || /^(null|~|true|false)$/i.test(s)) {
    return JSON.stringify(s);
  }
  return s;
}

/**
 * Compose YAML frontmatter (flat meta) + body into a markdown file string.
 * Emits keys in the canonical schema order, then any extra keys.
 */
function composeFrontmatter(meta, body) {
  const lines = ['---'];
  const emit = (k, v) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      if (v.length === 0) {
        lines.push(`${k}: []`);
        return;
      }
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`);
    } else {
      lines.push(`${k}: ${yamlScalar(v)}`);
    }
  };

  const order = [
    'id', 'type', 'title', 'summary', 'tags', 'status',
    'created', 'updated', 'source_urls', 'supersedes', 'embedding_version',
  ];
  const seen = new Set();
  for (const k of order) {
    if (Object.prototype.hasOwnProperty.call(meta, k)) {
      emit(k, meta[k]);
      seen.add(k);
    }
  }
  for (const k of Object.keys(meta)) {
    if (!seen.has(k)) emit(k, meta[k]);
  }
  lines.push('---');

  const b = String(body == null ? '' : body).replace(/^\n+/, '');
  return `${lines.join('\n')}\n\n${b}${b.endsWith('\n') ? '' : '\n'}`;
}

/**
 * Create/update a knowledge doc: compose+write markdown, embed-on-write into the
 * index, then enqueue an async git sync (unless noGit).
 *
 * @param {{ name: string, type?: string, content: string, metadata?: object }} input
 * @param {{ store?: object, noGit?: boolean }} [opts]
 * @returns {Promise<{ path: string, chunks: number, committed: boolean }>}
 */
async function writeKnowledge(input, opts = {}) {
  const { name, content, metadata } = input || {};
  const type = (input && input.type) || 'guide';
  const { store = null, noGit = false } = opts;

  if (!name) throw new Error('writeKnowledge: name (slug) is required');

  const dir = dirForType(type);
  const absDir = path.resolve(REPO_ROOT, dir);
  const relPath = `${dir}/${name}.md`;
  const absPath = path.join(absDir, `${name}.md`);

  // Build frontmatter meta from caller metadata + enforced id/type.
  const meta = Object.assign({}, metadata || {});
  meta.id = name;
  meta.type = type;
  if (!meta.title) meta.title = name;
  if (meta.embedding_version == null) meta.embedding_version = EMBEDDING_VERSION;

  const body = String(content == null ? '' : content);
  const existed = fs.existsSync(absPath);

  // 1. Source-of-record on disk.
  fs.mkdirSync(absDir, { recursive: true });
  fs.writeFileSync(absPath, composeFrontmatter(meta, body), 'utf-8');

  // 2. Embed-on-write: keep the local read surface correct immediately.
  let chunksCount = 0;
  if (store) {
    try {
      const contentHash = sha256(body);
      const chunks = chunk({ meta, body });
      const embeddings = [];
      for (const c of chunks) {
        embeddings.push(await embedPassage(c.text));
      }
      const upsertChunks = chunks.map((c) => ({
        heading_path: c.heading_path,
        chunk_index: c.chunk_index,
        text: c.text,
        content_hash: sha256(c.text),
      }));
      upsertDoc(store, {
        meta: {
          id: meta.id,
          type: meta.type,
          title: meta.title,
          updated: meta.updated != null ? meta.updated : null,
          path: relPath,
          content_hash: contentHash,
          embedding_version: meta.embedding_version,
        },
        chunks: upsertChunks,
        embeddings,
      });
      chunksCount = upsertChunks.length;
    } catch (err) {
      // Index failures never block the write — the markdown is the truth and a
      // reindex/self-heal will reconcile the cache later.
      console.error(`[alexandria] embed-on-write failed for ${relPath}: ${err.message}`);
    }
  }

  // 3. Enqueue async git sync (non-blocking). The file + index are already
  //    correct, so we return to the caller without awaiting the push.
  let committed = false;
  if (!noGit) {
    const verb = existed ? 'update' : 'create';
    const message = `docs(${type}): ${verb} ${name}`;
    Promise.resolve(syncCommitAndPush(relPath, message, {}))
      .catch((err) => console.error(`[alexandria] syncCommitAndPush error: ${err.message}`));
    committed = true; // git sync enqueued
  }

  return { path: relPath, chunks: chunksCount, committed };
}

/**
 * Read the full markdown of a doc directly from disk (the rare full-text
 * fallback). `raw:true` strips frontmatter. Returns null if not found.
 *
 * @param {{ id?: string, name?: string, type?: string, raw?: boolean }} input
 * @returns {Promise<string|null>}
 */
async function readKnowledge(input = {}) {
  const slug = input.id || input.name;
  const { type, raw = false } = input;
  if (!slug) throw new Error('readKnowledge: id or name is required');

  const dirs = type ? [dirForType(type)] : CONTENT_DIRS;
  for (const dir of dirs) {
    const absPath = path.resolve(REPO_ROOT, dir, `${slug}.md`);
    if (fs.existsSync(absPath)) {
      const text = fs.readFileSync(absPath, 'utf-8');
      if (raw) {
        return parseFrontmatter(text, `${slug}.md`).body;
      }
      return text;
    }
  }
  return null;
}

/**
 * List docs across content dirs (or one type). Returns one formatted line per
 * doc: `slug — title [type]`.
 *
 * @param {{ type?: string }} [input]
 * @returns {string[]}
 */
function listKnowledge(input = {}) {
  const { type } = input;
  const dirs = type ? [dirForType(type)] : CONTENT_DIRS;
  const out = [];
  for (const dir of dirs) {
    const absDir = path.resolve(REPO_ROOT, dir);
    let entries;
    try {
      entries = fs.readdirSync(absDir);
    } catch {
      continue; // dir does not exist yet
    }
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      const slug = f.replace(/\.md$/i, '');
      let title = slug;
      let dtype = typeForDir(dir);
      try {
        const { meta } = parseFrontmatter(fs.readFileSync(path.join(absDir, f), 'utf-8'), f);
        title = meta.title || slug;
        dtype = meta.type || dtype;
      } catch {
        /* fall back to slug/dir-derived type */
      }
      out.push(`${slug} — ${title} [${dtype}]`);
    }
  }
  return out;
}

module.exports = {
  writeKnowledge,
  readKnowledge,
  listKnowledge,
  composeFrontmatter,
  CONTENT_DIRS,
  TYPE_DIRS,
};
