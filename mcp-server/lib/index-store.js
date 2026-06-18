/**
 * index-store.js — sqlite-vec-backed vector index for Alexandria's knowledge base.
 *
 * Wraps a `better-sqlite3` connection with the `sqlite-vec` extension loaded,
 * exposing a small composable API: open the index, upsert a doc's chunks +
 * embeddings (content-hash-skipping unchanged docs), and run KNN search.
 *
 * The DB file (`.index/knowledge.db` by default) is a REBUILDABLE CACHE —
 * gitignored, always reconstructible from the markdown source-of-record. No
 * MCP wiring lives here (that is a later task); this is the storage primitive.
 *
 * This file is CommonJS (see lib/package.json `"type": "commonjs"`), consistent
 * with frontmatter.js / chunker.js / embedder.js.
 *
 * Schema (per design — Index & Embedding Pipeline → Storage layout):
 *   docs(doc_id PK, path, type, title, updated, content_hash, embedding_version)
 *   chunks(rowid PK, doc_id, type, heading_path, chunk_index, text, content_hash)
 *   vec_chunks USING vec0(rowid INTEGER PRIMARY KEY, embedding FLOAT[384])
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');

const EMBEDDING_DIM = 384;

// Default index location: <repo>/mcp-server/.index/knowledge.db (gitignored).
// __dirname is mcp-server/lib.
const DEFAULT_DB_PATH = path.resolve(__dirname, '..', '.index', 'knowledge.db');

/**
 * Open (creating if needed) the sqlite-vec index and return a store handle
 * holding the live db connection plus prepared statements.
 * @param {string} [dbPath] - override the DB file location (tests use a temp path).
 * @returns {{ db: import('better-sqlite3').Database, stmts: Object }}
 */
function openIndex(dbPath) {
  const file = dbPath || DEFAULT_DB_PATH;

  // Ensure the parent dir exists (e.g. the gitignored .index/).
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  sqliteVec.load(db);

  createSchema(db);

  const stmts = {
    getDocHash: db.prepare('SELECT content_hash FROM docs WHERE doc_id = ?'),
    upsertDoc: db.prepare(
      `INSERT INTO docs (doc_id, path, type, title, updated, content_hash, embedding_version)
       VALUES (@doc_id, @path, @type, @title, @updated, @content_hash, @embedding_version)
       ON CONFLICT(doc_id) DO UPDATE SET
         path = excluded.path,
         type = excluded.type,
         title = excluded.title,
         updated = excluded.updated,
         content_hash = excluded.content_hash,
         embedding_version = excluded.embedding_version`
    ),
    // Collect existing chunk rowids for a doc so we can clear matching vec rows.
    selectChunkRowids: db.prepare('SELECT rowid FROM chunks WHERE doc_id = ?'),
    deleteChunks: db.prepare('DELETE FROM chunks WHERE doc_id = ?'),
    deleteVec: db.prepare('DELETE FROM vec_chunks WHERE rowid = ?'),
    insertChunk: db.prepare(
      `INSERT INTO chunks (doc_id, type, heading_path, chunk_index, text, content_hash)
       VALUES (@doc_id, @type, @heading_path, @chunk_index, @text, @content_hash)`
    ),
    insertVec: db.prepare(
      'INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)'
    ),
  };

  return { db, stmts };
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS docs (
      doc_id            TEXT PRIMARY KEY,
      path              TEXT,
      type              TEXT,
      title             TEXT,
      updated           TEXT,
      content_hash      TEXT,
      embedding_version INTEGER
    );

    CREATE TABLE IF NOT EXISTS chunks (
      rowid        INTEGER PRIMARY KEY,
      doc_id       TEXT,
      type         TEXT,
      heading_path TEXT,
      chunk_index  INTEGER,
      text         TEXT,
      content_hash TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks (doc_id);
  `);

  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
       rowid INTEGER PRIMARY KEY,
       embedding FLOAT[${EMBEDDING_DIM}]
     );`
  );
}

/**
 * Serialize a number[] embedding into the compact float32 blob sqlite-vec stores.
 * @param {number[]} vec
 * @returns {Buffer}
 */
function toVecBlob(vec) {
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIM) {
    throw new Error(
      `index-store: embedding must be a ${EMBEDDING_DIM}-dim number[], got ${
        Array.isArray(vec) ? vec.length : typeof vec
      }`
    );
  }
  return Buffer.from(Float32Array.from(vec).buffer);
}

/**
 * Insert or refresh a single doc's chunks + embeddings.
 *
 * Content-hash skip: if `docs.content_hash` for `meta.id` already matches
 * `meta.content_hash`, nothing is touched and `{ skipped: true }` is returned.
 * Otherwise the doc's prior chunks/vec rows are deleted and fresh rows inserted,
 * all within a single transaction.
 *
 * @param {{ db, stmts }} store
 * @param {{ meta: Object, chunks: Array, embeddings: number[][] }} payload
 *   meta: { id, type?, title?, updated?, path?, content_hash, embedding_version? }
 *   chunks: [{ heading_path, chunk_index, text, content_hash }] aligned to embeddings
 * @returns {{ skipped: true } | { skipped: false, doc_id: string, chunks: number }}
 */
function upsertDoc(store, payload) {
  const { db, stmts } = store;
  const meta = (payload && payload.meta) || {};
  const chunks = (payload && payload.chunks) || [];
  const embeddings = (payload && payload.embeddings) || [];

  const docId = meta.id;
  if (!docId) throw new Error('index-store: upsertDoc requires meta.id');
  if (chunks.length !== embeddings.length) {
    throw new Error(
      `index-store: chunks (${chunks.length}) and embeddings (${embeddings.length}) must align`
    );
  }

  // Content-hash skip — unchanged doc, no work to do.
  const existing = stmts.getDocHash.get(docId);
  if (
    existing &&
    meta.content_hash != null &&
    existing.content_hash === meta.content_hash
  ) {
    return { skipped: true };
  }

  // Pre-serialize embeddings before opening the write transaction so a bad
  // vector throws cleanly without leaving a half-written doc.
  const blobs = embeddings.map(toVecBlob);

  const run = db.transaction(() => {
    // Clear this doc's old vec rows (keyed on its chunk rowids) then chunks.
    for (const { rowid } of stmts.selectChunkRowids.all(docId)) {
      stmts.deleteVec.run(BigInt(rowid));
    }
    stmts.deleteChunks.run(docId);

    stmts.upsertDoc.run({
      doc_id: docId,
      path: meta.path != null ? meta.path : null,
      type: meta.type != null ? meta.type : null,
      title: meta.title != null ? meta.title : null,
      updated: meta.updated != null ? meta.updated : null,
      content_hash: meta.content_hash != null ? meta.content_hash : null,
      embedding_version:
        meta.embedding_version != null ? meta.embedding_version : null,
    });

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const info = stmts.insertChunk.run({
        doc_id: docId,
        type: meta.type != null ? meta.type : null,
        heading_path: c.heading_path != null ? c.heading_path : '',
        chunk_index: c.chunk_index != null ? c.chunk_index : i,
        text: c.text != null ? c.text : '',
        content_hash: c.content_hash != null ? c.content_hash : null,
      });
      // vec0 binds primary keys strictly as integers; better-sqlite3 sends a
      // JS Number as REAL, which vec0 rejects — pass a BigInt instead.
      stmts.insertVec.run(BigInt(info.lastInsertRowid), blobs[i]);
    }
  });

  run();
  return { skipped: false, doc_id: docId, chunks: chunks.length };
}

/**
 * K-nearest-neighbour search over the vector index.
 *
 * Embeddings are L2-normalized, so euclidean distance `d` maps to cosine
 * similarity as `score = 1 - d²/2` (1 = identical, 0 = orthogonal). Results are
 * returned best-first.
 *
 * @param {{ db, stmts }} store
 * @param {number[]} queryVec - 384-dim query embedding
 * @param {{ top_k?: number, type?: string }} [opts]
 * @returns {Array<{ doc_id, type, title, heading_path, chunk_index, text, score }>}
 */
function knn(store, queryVec, opts) {
  const { db } = store;
  const options = opts || {};
  const topK = options.top_k != null ? options.top_k : 8;
  const type = options.type;

  const queryBlob = toVecBlob(queryVec);

  // vec0 KNN must constrain `k` inside the MATCH. When a type filter is present
  // we over-fetch (the filter can drop matches) then slice to top_k afterwards.
  const k = type ? Math.max(topK * 4, topK) : topK;

  const rows = db
    .prepare(
      `SELECT c.doc_id    AS doc_id,
              c.type       AS type,
              d.title      AS title,
              c.heading_path AS heading_path,
              c.chunk_index  AS chunk_index,
              c.text       AS text,
              v.distance   AS distance
         FROM vec_chunks v
         JOIN chunks c ON c.rowid = v.rowid
         LEFT JOIN docs d ON d.doc_id = c.doc_id
        WHERE v.embedding MATCH ? AND k = ?
        ORDER BY v.distance`
    )
    .all(queryBlob, k);

  let hits = rows.map((r) => ({
    doc_id: r.doc_id,
    type: r.type,
    title: r.title,
    heading_path: r.heading_path,
    chunk_index: r.chunk_index,
    text: r.text,
    score: 1 - (r.distance * r.distance) / 2,
  }));

  if (type) hits = hits.filter((h) => h.type === type);

  return hits.slice(0, topK);
}

/**
 * Close the underlying database connection.
 * @param {{ db }} store
 */
function close(store) {
  if (store && store.db && store.db.open) store.db.close();
}

module.exports = { openIndex, upsertDoc, knn, close, EMBEDDING_DIM };
