/**
 * search.js — the primary query surface for Alexandria's knowledge base.
 *
 * Two modes behind one entry point:
 *
 *   - semantic (default): embed the query locally with the `query:` prefix →
 *     KNN over the sqlite-vec index → filter by min_score → ranked chunk hits.
 *   - lexical-fallback: a case-insensitive SUBSTRING scan over the markdown
 *     source-of-record (the legacy `search_guides` behavior, generalized across
 *     all content dirs). Used when `lexical:true` is forced, OR transparently
 *     when the index/embedder is unavailable (any error in the semantic path).
 *
 * Returns chunks, not whole docs, so it is far cheaper and more precise than the
 * legacy full-line dumps. The markdown filesystem is only ever touched in the
 * lexical fallback — the rare safety net, never the routine path.
 *
 * This file is CommonJS (see lib/package.json `"type": "commonjs"`), consistent
 * with frontmatter.js / chunker.js / embedder.js / index-store.js / reindex.js,
 * and is loaded from the ESM `index.js` via createRequire.
 *
 * Design ref: alexandria-vectordb-design.md → "MCP Tool Surface" → search_knowledge.
 */

const fs = require('fs');
const path = require('path');

const { embedQuery } = require('./embedder');
const { knn } = require('./index-store');
const { parseFrontmatter } = require('./frontmatter');

// __dirname is mcp-server/lib → repo root is two levels up. Same anchor the
// reindex pipeline uses so the lexical scan walks the identical source dirs.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const CONTENT_DIRS = ['guides', 'concepts', 'articles', 'references'];

// Map a content dir name → the singular `type` value used in frontmatter.
const DIR_TYPE = {
  guides: 'guide',
  concepts: 'concept',
  articles: 'article',
  references: 'reference',
};

const SNIPPET_LEN = 200;

/** First ~200 chars of a chunk/line, whitespace-collapsed for a clean preview. */
function snippetOf(text, n) {
  const limit = n != null ? n : SNIPPET_LEN;
  const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return s.length > limit ? s.slice(0, limit) : s;
}

/**
 * Search the knowledge base.
 *
 * @param {{ db, stmts }|null} store - open index-store handle (or null/unavailable)
 * @param {string} query
 * @param {{ type?: string, top_k?: number, min_score?: number, lexical?: boolean }} [opts]
 * @returns {Promise<{ mode: 'semantic'|'lexical-fallback',
 *   hits: Array<{ doc_id, type, title, heading_path, score, snippet }> }>}
 */
async function searchKnowledge(store, query, opts) {
  const options = opts || {};
  const type = options.type;
  const topK = options.top_k != null ? options.top_k : 8;
  const minScore = options.min_score != null ? options.min_score : 0;
  const lexical = !!options.lexical;

  // Semantic path — unless explicitly forced lexical. Any failure (no store,
  // embedder can't load, KNN error) degrades transparently to the substring scan.
  if (!lexical) {
    try {
      if (!store) throw new Error('vector index unavailable');
      const vec = await embedQuery(query);
      const raw = knn(store, vec, { top_k: topK, type });
      const hits = raw
        .filter((h) => h.score >= minScore)
        .map((h) => ({
          doc_id: h.doc_id,
          type: h.type,
          title: h.title,
          heading_path: h.heading_path,
          score: h.score,
          snippet: snippetOf(h.text),
        }));
      return { mode: 'semantic', hits };
    } catch (err) {
      // Fall through to the lexical fallback below.
    }
  }

  return lexicalSearch(query, { type, top_k: topK });
}

/**
 * Case-insensitive substring scan over the markdown content dirs. Mirrors the
 * legacy `search_guides` logic but generalized across all content types and
 * shaped to the same hit contract as the semantic path.
 *
 * @param {string} query
 * @param {{ type?: string, top_k?: number }} [opts]
 * @returns {{ mode: 'lexical-fallback', hits: Array<Object> }}
 */
function lexicalSearch(query, opts) {
  const options = opts || {};
  const type = options.type;
  const topK = options.top_k != null ? options.top_k : 8;
  const needle = String(query == null ? '' : query).toLowerCase();

  const hits = [];

  for (const dir of CONTENT_DIRS) {
    const absDir = path.resolve(REPO_ROOT, dir);
    let entries;
    try {
      entries = fs.readdirSync(absDir);
    } catch {
      continue; // dir does not exist yet — skip
    }

    for (const filename of entries) {
      if (!filename.endsWith('.md')) continue;

      let raw;
      try {
        raw = fs.readFileSync(path.join(absDir, filename), 'utf-8');
      } catch {
        continue;
      }

      let meta;
      let body;
      try {
        ({ meta, body } = parseFrontmatter(raw, filename));
      } catch {
        meta = {
          id: filename.replace(/\.md$/i, ''),
          type: DIR_TYPE[dir] || 'guide',
          title: filename,
        };
        body = raw;
      }

      // Honor the type filter even in the fallback path.
      if (type && meta.type !== type) continue;

      const lines = body.split('\n');
      let headingPath = '';
      let matchCount = 0;
      let firstHit = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hm = line.match(/^#{1,6}[ \t]+(.+?)\s*$/);
        if (hm) {
          headingPath = hm[1].trim();
          continue;
        }
        if (needle && line.toLowerCase().includes(needle)) {
          matchCount++;
          if (firstHit === null) {
            firstHit = { heading_path: headingPath, text: line.trim() };
          }
        }
      }

      if (matchCount > 0 && firstHit) {
        hits.push({
          doc_id: meta.id,
          type: meta.type,
          title: meta.title,
          heading_path: firstHit.heading_path,
          // No semantic distance available — rank by match frequency.
          score: matchCount,
          snippet: snippetOf(firstHit.text),
        });
      }
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return { mode: 'lexical-fallback', hits: hits.slice(0, topK) };
}

/**
 * Collapse a flat list of chunk hits down to one entry per doc — the
 * highest-scoring chunk wins — and reshape to the compact briefing contract.
 *
 * @param {Array<{ doc_id, type, title, score, snippet }>} hits
 * @param {number} topK - max docs to return
 * @returns {Array<{ doc_id, type, title, snippet, score }>} best-first
 */
function dedupeBriefing(hits, topK) {
  const best = new Map();
  for (const h of hits || []) {
    if (!h || h.doc_id == null) continue;
    const prev = best.get(h.doc_id);
    if (!prev || h.score > prev.score) {
      best.set(h.doc_id, {
        doc_id: h.doc_id,
        type: h.type,
        title: h.title,
        snippet: h.snippet,
        score: h.score,
      });
    }
  }
  return Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * "What do we already know about X" — a multi-type semantic recall, deduplicated
 * to one best chunk per doc, returned as a compact briefing for agents to pull
 * prior learnings into context at task start.
 *
 * Searches across ALL content types (or just `types` when given), reusing
 * searchKnowledge (which itself degrades to the lexical substring scan when the
 * index/embedder is unavailable). Over-fetches chunks so that after collapsing
 * to one-per-doc we still surface ~top_k distinct docs.
 *
 * @param {{ db, stmts }|null} store - open index-store handle (or null/unavailable)
 * @param {string} topic
 * @param {{ top_k?: number, types?: string[] }} [opts]
 * @returns {Promise<Array<{ doc_id, type, title, snippet, score }>>} best-first, one per doc
 */
async function recallContext(store, topic, opts) {
  const options = opts || {};
  const topK = options.top_k != null ? options.top_k : 12;
  const types = Array.isArray(options.types) && options.types.length
    ? options.types
    : null;

  // A doc can contribute several chunks, so over-fetch before dedup-by-doc to
  // still end up with ~topK distinct docs.
  const poolK = Math.max(topK * 4, topK + 20);

  try {
    let hits;
    if (types) {
      // One typed search per requested type, merged. searchKnowledge honors the
      // single-type filter in both semantic and lexical modes.
      const perType = await Promise.all(
        types.map((t) => searchKnowledge(store, topic, { type: t, top_k: poolK }))
      );
      hits = perType.flatMap((r) => (r && r.hits) || []);
    } else {
      const r = await searchKnowledge(store, topic, { top_k: poolK });
      hits = (r && r.hits) || [];
    }
    return dedupeBriefing(hits, topK);
  } catch (err) {
    // searchKnowledge already falls back internally, but guard the merge/dedup
    // path too: degrade to a direct lexical scan over the requested types.
    if (types) {
      const merged = types.flatMap((t) => lexicalSearch(topic, { type: t, top_k: poolK }).hits);
      return dedupeBriefing(merged, topK);
    }
    return dedupeBriefing(lexicalSearch(topic, { top_k: poolK }).hits, topK);
  }
}

module.exports = { searchKnowledge, recallContext };
