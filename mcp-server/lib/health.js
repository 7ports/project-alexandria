'use strict';

/**
 * health.js — read-only consistency report behind the `knowledge_health` tool.
 *
 * Alexandria keeps three derived views of the markdown source-of-record:
 *   - the sqlite-vec index   (what search_knowledge / recall_context can find)
 *   - docs/guides/manifest.json (what the published site lists)
 *   - the git remote         (what other machines will see)
 * Each one can drift silently: a stale index still answers, just with fewer hits, and a stale
 * manifest still renders, just without the newest docs. This module computes the drift as
 * named set differences so it is a one-call question instead of a hand audit.
 *
 * The manifest is regenerated and committed by CI on every deploy, not by the write path
 * (two writers of one generated file is a guaranteed merge conflict). Between a write and the
 * next deploy the manifest is therefore expected to lag; `manifest.dirty` reports exactly that.
 *
 * Never mutates anything. CommonJS (see lib/package.json "type":"commonjs").
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { parseFrontmatter } = require('./frontmatter');
const { REPO_ROOT, dirForType, typeForDir, listContentFiles } = require('./content');

const MANIFEST_REL = 'docs/guides/manifest.json';

function sha256(text) {
  return crypto.createHash('sha256').update(String(text == null ? '' : text)).digest('hex');
}

function minus(a, b) {
  return [...a].filter((x) => !b.has(x)).sort();
}

/** Same body hash reindex.js stores as docs.content_hash. */
function bodyHash(absPath, filename) {
  try {
    return sha256(parseFrontmatter(fs.readFileSync(absPath, 'utf-8'), filename).body);
  } catch {
    return null;
  }
}

function readManifest(absPath) {
  let raw;
  try {
    raw = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return { error: 'missing', paths: new Set() };
  }
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (err) {
    return { error: `unparseable: ${err.message}`, paths: new Set() };
  }
  if (!Array.isArray(entries)) return { error: 'not an array', paths: new Set() };
  // Older manifests have no `type` field: every entry was a guide.
  const paths = new Set(entries.map((e) => `${dirForType(e.type || 'guide')}/${e.name}.md`));
  return { error: null, paths, count: entries.length };
}

/**
 * @param {{ db }|null} store - open index-store handle, or null when the index is unavailable
 * @param {{ repoRoot?: string, manifestPath?: string, syncState?: object }} [opts]
 */
function knowledgeHealth(store, opts = {}) {
  const repoRoot = opts.repoRoot || REPO_ROOT;
  const manifestPath = opts.manifestPath || path.join(repoRoot, MANIFEST_REL);

  const files = listContentFiles({ repoRoot });
  const disk = new Set(files.map((f) => f.relPath));
  const byType = {};
  for (const f of files) byType[f.type] = (byType[f.type] || 0) + 1;

  // --- index ---
  const index = { available: !!store, count: null };
  if (store) {
    try {
      const rows = store.db
        .prepare(
          `SELECT d.doc_id, d.path, d.type, d.content_hash,
                  (SELECT COUNT(*) FROM chunks c WHERE c.doc_id = d.doc_id) AS chunks
             FROM docs d`
        )
        .all();
      const indexed = new Set(rows.map((r) => r.path));
      const fileByRel = new Map(files.map((f) => [f.relPath, f]));
      index.count = rows.length;
      index.chunks = rows.reduce((s, r) => s + r.chunks, 0);
      index.not_indexed = minus(disk, indexed);
      index.not_on_disk = minus(indexed, disk);
      index.stale = rows
        .filter((r) => {
          const f = fileByRel.get(r.path);
          return f && bodyHash(f.absPath, f.filename) !== r.content_hash;
        })
        .map((r) => r.path)
        .sort();
      index.zero_chunks = rows.filter((r) => r.chunks === 0).map((r) => r.path).sort();
      index.mistyped = rows
        .filter((r) => disk.has(r.path) && r.type !== typeForDir(r.path.split('/')[0]))
        .map((r) => `${r.path} (indexed as ${r.type})`)
        .sort();
    } catch (err) {
      index.available = false;
      index.error = err.message;
    }
  }

  // --- manifest ---
  const m = readManifest(manifestPath);
  const manifest = {
    path: path.relative(repoRoot, manifestPath).split(path.sep).join('/'),
    error: m.error,
    count: m.error ? null : m.count,
    not_in_manifest: minus(disk, m.paths),
    not_on_disk: minus(m.paths, disk),
  };
  manifest.dirty = !!m.error || manifest.not_in_manifest.length > 0 || manifest.not_on_disk.length > 0;

  // --- git sync (process-wide state from git-sync.js) ---
  let s = opts.syncState;
  if (!s) {
    try {
      s = require('./git-sync').syncState;
    } catch {
      s = {};
    }
  }
  const sync = {
    sync_conflict: !!s.sync_conflict,
    conflict_file: s.conflict_file || null,
    last_sync_ok: s.last_sync_ok ? new Date(s.last_sync_ok).toISOString() : null,
  };

  const indexProblems = index.available
    ? index.not_indexed.length + index.not_on_disk.length + index.stale.length +
      index.zero_chunks.length + index.mistyped.length
    : 1;
  const healthy = indexProblems === 0 && !manifest.dirty && !sync.sync_conflict;

  return { healthy, disk: { count: disk.size, by_type: byType }, index, manifest, sync };
}

function list(label, items) {
  if (!items || items.length === 0) return [];
  const shown = items.slice(0, 25).map((x) => `    - ${x}`);
  if (items.length > 25) shown.push(`    … and ${items.length - 25} more`);
  return [`  ${label} (${items.length}):`, ...shown];
}

/** Render a knowledgeHealth() report as tool-output text. */
function formatHealth(h) {
  const types = Object.entries(h.disk.by_type).map(([t, n]) => `${t}:${n}`).join(', ');
  const out = [`# knowledge_health — ${h.healthy ? 'HEALTHY' : 'DRIFT DETECTED'}`, ''];
  out.push(`disk: ${h.disk.count} docs (${types})`);

  if (!h.index.available) {
    out.push(`index: UNAVAILABLE${h.index.error ? ` (${h.index.error})` : ''} — search is substring-only; run \`npm run doctor\` in mcp-server/`);
  } else {
    out.push(`index: ${h.index.count} docs, ${h.index.chunks} chunks`);
    out.push(...list('on disk but NOT indexed (unsearchable)', h.index.not_indexed));
    out.push(...list('indexed but NOT on disk (phantom hits)', h.index.not_on_disk));
    out.push(...list('indexed content is STALE (file changed since embed)', h.index.stale));
    out.push(...list('indexed with 0 chunks (will never surface)', h.index.zero_chunks));
    out.push(...list('indexed under the wrong type', h.index.mistyped));
  }

  if (h.manifest.error) {
    out.push(`manifest (${h.manifest.path}): ${h.manifest.error}`);
  } else {
    out.push(`manifest (${h.manifest.path}): ${h.manifest.count} entries${h.manifest.dirty ? ' — DIRTY' : ''}`);
  }
  out.push(...list('on disk but NOT in manifest (not listed on the site yet)', h.manifest.not_in_manifest));
  out.push(...list('in manifest but NOT on disk', h.manifest.not_on_disk));

  out.push(
    `git sync: ${h.sync.sync_conflict ? `CONFLICT on ${h.sync.conflict_file} — needs manual reconciliation` : 'no conflict'}` +
      `; last successful sync this process: ${h.sync.last_sync_ok || 'none yet'}`
  );

  if (!h.healthy) {
    out.push('');
    out.push('Fixes: index drift → `reindex_knowledge` (force:true for stale/mistyped rows).'
      + ' Manifest drift is expected between a write and the next deploy (CI regenerates and commits it);'
      + ' run `scripts/sync-docs.sh` to regenerate it locally.');
  }
  return out.join('\n');
}

module.exports = { knowledgeHealth, formatHealth, MANIFEST_REL };
