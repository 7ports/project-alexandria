/**
 * reindex.js — build & reconcile the Alexandria sqlite-vec knowledge index.
 *
 * Two entry points, both operating on an open index-store handle:
 *
 *  - reindexAll(store, opts)         full (idempotent) rebuild from markdown.
 *  - reconcileIndex(store, paths)    incremental re-embed of only changed docs.
 *
 * Both walk the markdown source-of-record (`guides/ concepts/ articles/
 * references/`), parse frontmatter, chunk, embed each chunk locally with the
 * `passage:` prefix, and upsert into the store. The content-hash skip is
 * honored throughout so unchanged docs cost nothing (unless `force`).
 *
 * This file is CommonJS (see lib/package.json `"type": "commonjs"`), consistent
 * with frontmatter.js / chunker.js / embedder.js / index-store.js, and is
 * loaded from the ESM `index.js` via createRequire.
 *
 * Design refs: alexandria-vectordb-design.md → "Index & Embedding Pipeline" /
 * "Startup self-heal"; alexandria-sync-and-boundary-addendum.md → "Freshness &
 * Reconciliation" (the reconcileIndex incremental rule).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseFrontmatter } = require('./frontmatter');
const { chunk } = require('./chunker');
const { embedPassage } = require('./embedder');
const { upsertDoc } = require('./index-store');
const { addReembedded, setIndexSize } = require('./metrics-hooks');

// Bumped when the model or chunking changes → forces a full reindex. Kept in
// sync with the design's frontmatter `embedding_version` default of 1.
const EMBEDDING_VERSION = 1;

const DEFAULT_CONTENT_DIRS = ['guides', 'concepts', 'articles', 'references'];

// __dirname is mcp-server/lib → repo root is two levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function sha256(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text)).digest('hex');
}

/**
 * List every *.md file under the given content dirs that actually exist.
 * @param {string[]} contentDirs - repo-root-relative dir names
 * @returns {Array<{ relPath: string, absPath: string, dir: string, filename: string }>}
 */
function listMarkdown(contentDirs) {
  const out = [];
  for (const dir of contentDirs) {
    const absDir = path.resolve(REPO_ROOT, dir);
    let entries;
    try {
      entries = fs.readdirSync(absDir);
    } catch {
      continue; // dir does not exist yet — skip
    }
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      out.push({
        relPath: `${dir}/${f}`,
        absPath: path.join(absDir, f),
        dir,
        filename: f,
      });
    }
  }
  return out;
}

/**
 * Build the upsert payload (meta + chunks + embeddings) for one markdown file
 * and write it into the store. Embeds each chunk with the `passage:` prefix.
 * @returns {Promise<{ skipped: boolean, chunks: number }>}
 */
async function embedAndUpsert(store, file, body, meta, contentHash) {
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

  const res = upsertDoc(store, {
    meta: {
      id: meta.id,
      type: meta.type,
      title: meta.title,
      updated: meta.updated != null ? meta.updated : null,
      path: file.relPath,
      content_hash: contentHash,
      embedding_version:
        meta.embedding_version != null ? meta.embedding_version : EMBEDDING_VERSION,
    },
    chunks: upsertChunks,
    embeddings,
  });

  return { skipped: !!res.skipped, chunks: upsertChunks.length };
}

/**
 * Remove a doc and all of its chunk/vec rows from the index entirely.
 * Used when a markdown file has been deleted out-of-band (reconciliation).
 */
function removeDoc(store, docId) {
  const { db } = store;
  const run = db.transaction(() => {
    const rows = db.prepare('SELECT rowid FROM chunks WHERE doc_id = ?').all(docId);
    const delVec = db.prepare('DELETE FROM vec_chunks WHERE rowid = ?');
    for (const { rowid } of rows) delVec.run(BigInt(rowid));
    db.prepare('DELETE FROM chunks WHERE doc_id = ?').run(docId);
    db.prepare('DELETE FROM docs WHERE doc_id = ?').run(docId);
  });
  run();
}

/**
 * Full (idempotent) rebuild of the index from the markdown source-of-record.
 *
 * Walks each EXISTING content dir for *.md, parses frontmatter, chunks, embeds
 * each chunk, and upserts. Docs whose content_hash is unchanged are skipped
 * (no re-embed) unless `force` is set.
 *
 * @param {{ db, stmts }} store
 * @param {{ contentDirs?: string[], force?: boolean }} [opts]
 * @returns {Promise<{ docs: number, chunksEmbedded: number, skipped: number }>}
 */
async function reindexAll(store, opts) {
  const options = opts || {};
  const contentDirs = options.contentDirs || DEFAULT_CONTENT_DIRS;
  const force = !!options.force;

  const files = listMarkdown(contentDirs);

  let chunksEmbedded = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = fs.readFileSync(file.absPath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw, file.filename);
    const contentHash = sha256(body);

    // Content-hash skip (cheap path): when not forcing, avoid the expensive
    // embed pass for docs already indexed at this exact hash.
    if (!force) {
      const existing = store.stmts.getDocHash.get(meta.id);
      if (existing && existing.content_hash === contentHash) {
        skipped++;
        continue;
      }
    } else {
      // Force re-embed: drop the docs row so upsertDoc's own hash-skip cannot
      // short-circuit an unchanged doc. upsertDoc still clears stale chunks.
      store.db.prepare('DELETE FROM docs WHERE doc_id = ?').run(meta.id);
    }

    const res = await embedAndUpsert(store, file, body, meta, contentHash);
    if (res.skipped) skipped++;
    else chunksEmbedded += res.chunks;
  }

  setIndexSize('docs', files.length - skipped);
  setIndexSize('chunks', chunksEmbedded);
  return { docs: files.length, chunksEmbedded, skipped };
}

/**
 * Incremental reconciliation after a pull (or any out-of-band change) lands new
 * markdown. Re-embeds ONLY the docs whose content_hash changed; deletes docs
 * whose files were removed; skips unchanged docs.
 *
 * A full `reindexAll(force)` is triggered only on embedding_version / schema
 * drift (per the addendum's "Freshness & Reconciliation" rule).
 *
 * @param {{ db, stmts }} store
 * @param {string[]} changedPaths - repo-root-relative (or absolute) *.md paths
 * @param {{ contentDirs?: string[] }} [opts]
 * @returns {Promise<{ reembedded: number, deleted: number, skipped: number }>}
 */
async function reconcileIndex(store, changedPaths, opts) {
  const options = opts || {};
  const contentDirs = options.contentDirs || DEFAULT_CONTENT_DIRS;

  const filtered = normalizeChangedPaths(changedPaths, contentDirs);

  // Schema / embedding_version drift → full rebuild rather than incremental.
  if (driftDetected(store, filtered)) {
    const r = await reindexAll(store, { contentDirs, force: true });
    return { reembedded: r.docs - r.skipped, deleted: 0, skipped: r.skipped };
  }

  let reembedded = 0;
  let deleted = 0;
  let skipped = 0;

  for (const file of filtered) {
    if (!fs.existsSync(file.absPath)) {
      removeDoc(store, slugOf(file.filename));
      deleted++;
      continue;
    }

    const raw = fs.readFileSync(file.absPath, 'utf-8');
    const { meta, body } = parseFrontmatter(raw, file.filename);
    const contentHash = sha256(body);

    const existing = store.stmts.getDocHash.get(meta.id);
    if (existing && existing.content_hash === contentHash) {
      skipped++;
      continue;
    }

    const res = await embedAndUpsert(store, file, body, meta, contentHash);
    if (res.skipped) skipped++;
    else reembedded++;
  }

  if (reembedded > 0) addReembedded(reembedded);
  return { reembedded, deleted, skipped };
}

/** filename → stable slug = basename without `.md`. */
function slugOf(filename) {
  return String(filename).split(/[\\/]/).pop().replace(/\.md$/i, '');
}

/**
 * Resolve raw changed paths to { relPath, absPath, dir, filename } records,
 * keeping only *.md files that live under one of the content dirs.
 */
function normalizeChangedPaths(changedPaths, contentDirs) {
  const dirs = new Set(contentDirs);
  const out = [];
  for (const raw of changedPaths || []) {
    if (!raw || !String(raw).endsWith('.md')) continue;
    const rel = path.isAbsolute(raw) ? path.relative(REPO_ROOT, raw) : raw;
    const norm = rel.split(path.sep).join('/');
    const top = norm.split('/')[0];
    if (!dirs.has(top)) continue;
    out.push({
      relPath: norm,
      absPath: path.resolve(REPO_ROOT, norm),
      dir: top,
      filename: norm.split('/').pop(),
    });
  }
  return out;
}

/**
 * Detect embedding_version / schema drift among the changed docs. If a doc
 * declares an embedding_version different from what the store recorded for it,
 * a full rebuild is required (the stored vectors are stale relative to the
 * current model/chunking contract).
 */
function driftDetected(store, files) {
  let stmt;
  try {
    stmt = store.db.prepare('SELECT embedding_version FROM docs WHERE doc_id = ?');
  } catch {
    return false;
  }
  for (const file of files) {
    if (!fs.existsSync(file.absPath)) continue;
    let meta;
    try {
      const raw = fs.readFileSync(file.absPath, 'utf-8');
      meta = parseFrontmatter(raw, file.filename).meta;
    } catch {
      continue;
    }
    const declared = meta.embedding_version != null ? meta.embedding_version : EMBEDDING_VERSION;
    const row = stmt.get(meta.id);
    if (row && row.embedding_version != null && row.embedding_version !== declared) {
      return true;
    }
  }
  return false;
}

/**
 * Compute a stable manifest hash over the content dirs — the relative path and
 * content-hash of every markdown file. Used by the startup self-heal to detect
 * out-of-band drift between the markdown source and the indexed docs table.
 * @param {string[]} [contentDirs]
 * @returns {string}
 */
function manifestHash(contentDirs) {
  const files = listMarkdown(contentDirs || DEFAULT_CONTENT_DIRS);
  const parts = files
    .map((f) => {
      let body = '';
      try {
        body = parseFrontmatter(fs.readFileSync(f.absPath, 'utf-8'), f.filename).body;
      } catch {
        body = '';
      }
      return `${f.relPath}:${sha256(body)}`;
    })
    .sort();
  return sha256(parts.join('\n'));
}

module.exports = {
  reindexAll,
  reconcileIndex,
  manifestHash,
  EMBEDDING_VERSION,
  DEFAULT_CONTENT_DIRS,
};
