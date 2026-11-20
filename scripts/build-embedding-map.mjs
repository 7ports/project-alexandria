#!/usr/bin/env node
/**
 * build-embedding-map.mjs — offline dimensionality-reduction + clustering reducer
 * for Alexandria's 3D embedding visualizer (docs/explore.html).
 *
 * Reads the sqlite-vec knowledge index (mcp-server/.index/knowledge.db), aggregates
 * chunk vectors to per-doc centroids (guides, concepts, articles, references), runs SEEDED UMAP 384->3 for both doc and
 * chunk granularities, runs SEEDED k-means (k chosen by silhouette over k in [4,10])
 * per granularity, joins curated front-matter `tags:`, and writes committed artifacts
 * under docs/data/:
 *   - embedding-map.json   (schema v1: coords + metadata + tag legend)
 *   - guide-vectors.bin    (Float32 [nDocs][384] doc-centroid vectors, row==vecIndex)
 *   - chunk-vectors.bin    (Float32 [nChunks][384] chunk vectors, row==vecIndex)
 *
 * Modes:
 *   node scripts/build-embedding-map.mjs           write artifacts
 *   node scripts/build-embedding-map.mjs --check   regenerate in memory and compare the
 *                                                   STRUCTURE (doc/chunk ids, titles, tags,
 *                                                   urls) with the committed artifacts;
 *                                                   exit 1 when they describe different docs
 *
 * Why --check ignores coordinates and vector bytes: ONNX embeddings differ in the last
 * bits across CPUs, and UMAP amplifies that into a visibly different layout, so a byte
 * compare failed and then passed on the same commit depending on the CI runner. What the
 * PR guard exists to catch is a content change whose map was never regenerated, and that
 * always shows up as a different doc/chunk set.
 *
 * Determinism: a fixed PRNG SEED makes UMAP + k-means produce stable, diff-clean
 * layouts. Build-time deps (umap-js, ml-kmeans) and the sqlite-vec index code live
 * under mcp-server/, so all native/3rd-party modules resolve from mcp-server/node_modules.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_SERVER = path.join(REPO_ROOT, 'mcp-server');
const DB_PATH = path.join(MCP_SERVER, '.index', 'knowledge.db');
// Content dir -> doc type. Non-guide docs have free-form tags, so they are coloured by type.
const CONTENT_TYPES = { guides: 'guide', concepts: 'concept', articles: 'article', references: 'reference' };
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'data');

// Resolve build-time deps from mcp-server/node_modules (the manifest that owns them).
const require = createRequire(path.join(MCP_SERVER, 'package.json'));
const Database = require('better-sqlite3');
const sqliteVec = require('sqlite-vec');
const { UMAP } = require('umap-js');
const { kmeans } = require('ml-kmeans');

const DIM = 384;
const MODEL = 'Xenova/bge-small-en-v1.5';
const SEED = 42;
const UMAP_N_NEIGHBORS = 15;
const UMAP_MIN_DIST = 0.1;
const K_MIN = 4;
const K_MAX = 10;
const POS_PRECISION = 6; // decimals for stored coords (diff stability)

// --- Relational edge computation (DOC-granularity only) ---
const KNN_K = 4;                          // top-K neighbours per node (kNN edge set)
const EDGE_THRESHOLD_MODE = 'percentile'; // 'percentile' | 'absolute'
const EDGE_THRESHOLD_PERCENTILE = 0.12;   // percentile mode: keep top 12% strongest pairs
const EDGE_W_PRECISION = 3;               // decimals for edge weights (diff stability)

// --- Curated tag taxonomy: ids/labels come from the project plan; the front-matter
// `tags:` value is the single source of truth for assignment. Order here == legend
// color order. ---
const TAG_LEGEND = [
  { id: 'mcp-server',      label: 'MCP Server',         color: '#4C78A8' },
  { id: 'claude-agents',   label: 'Claude & Agents',    color: '#F58518' },
  { id: 'frontend-web',    label: 'Frontend & Web',     color: '#54A24B' },
  { id: 'cloud-iac',       label: 'Cloud & IaC',        color: '#E45756' },
  { id: 'deployment-ci',   label: 'Deployment & CI/CD', color: '#72B7B2' },
  { id: 'data-apis',       label: 'Data APIs',          color: '#EECA3B' },
  { id: 'ai-ml',           label: 'AI / ML',            color: '#B279A2' },
  { id: 'observability',   label: 'Observability',      color: '#FF9DA6' },
  { id: 'testing',         label: 'Testing',            color: '#9D755D' },
  { id: 'languages-build', label: 'Languages & Build',  color: '#BAB0AC' },
  { id: 'dev-tooling',     label: 'Dev Tooling',        color: '#1F77B4' },
  // Non-guide content types (tagged by type, see readTags).
  { id: 'concept',         label: 'Concepts',           color: '#17BECF' },
  { id: 'article',         label: 'Articles',           color: '#BCBD22' },
  { id: 'reference',       label: 'References',         color: '#E377C2' },
];
const FALLBACK_PALETTE = ['#AEC7E8', '#FFBB78', '#98DF8A', '#FF9896', '#C5B0D5', '#C49C94', '#F7B6D2', '#C7C7C7', '#DBDB8D', '#9EDAE5'];

// --- Seeded PRNG (mulberry32) for deterministic UMAP layouts ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function l2normalize(vec) {
  let n = 0;
  for (let i = 0; i < vec.length; i++) n += vec[i] * vec[i];
  n = Math.sqrt(n);
  if (n === 0) return vec.slice();
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / n;
  return out;
}

function round(x, p) {
  const f = Math.pow(10, p);
  return Math.round(x * f) / f;
}

// --- Read the sqlite-vec index: guide docs + their chunk vectors ---
function readIndex() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `Index DB not found at ${DB_PATH}. Build it first via the mcp-server reindex, e.g.:\n` +
        `  node -e "const s=require('./mcp-server/lib/index-store').openIndex();` +
        `require('./mcp-server/lib/reindex').reindexAll(s,{force:true}).then(r=>console.log(r))"`
    );
  }
  const db = new Database(DB_PATH, { readonly: true });
  sqliteVec.load(db);

  const docRows = db.prepare('SELECT doc_id, title, path FROM docs').all();
  // Every content type; directory READMEs are not docs (older indexes may still hold them).
  const guideDocs = new Map();
  for (const d of docRows) {
    const [dir, file] = String(d.path || '').split('/');
    const type = CONTENT_TYPES[dir];
    if (!type || !file || file.toLowerCase() === 'readme.md') continue;
    guideDocs.set(d.doc_id, { id: d.doc_id, title: d.title || d.doc_id, type, file: path.join(REPO_ROOT, dir, file) });
  }

  const chunkRows = db
    .prepare(
      `SELECT c.rowid AS rowid, c.doc_id AS doc_id, c.heading_path AS heading,
              c.chunk_index AS chunk_index, vec.embedding AS embedding
         FROM vec_chunks vec
         JOIN chunks c ON c.rowid = vec.rowid`
    )
    .all();

  const chunks = [];
  for (const r of chunkRows) {
    if (!guideDocs.has(r.doc_id)) continue; // skip non-guide chunks
    const buf = r.embedding; // Node Buffer, 384 * 4 bytes, little-endian Float32
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, DIM);
    chunks.push({
      doc_id: r.doc_id,
      heading: r.heading || '',
      chunk_index: r.chunk_index != null ? r.chunk_index : 0,
      vec: l2normalize(Array.from(f32)),
    });
  }
  db.close();
  return { guideDocs, chunks };
}

// --- Tag per doc: guides use their curated single-primary front-matter tag; other types
// carry free-form tags, so they are grouped by type instead. ---
function readTags(guideDocs) {
  const tagOf = new Map();
  for (const [id, doc] of guideDocs) {
    if (doc.type !== 'guide') {
      tagOf.set(id, doc.type);
      continue;
    }
    const file = doc.file;
    let tag = '';
    try {
      const raw = fs.readFileSync(file, 'utf-8');
      const m = raw.match(/^tags:\s*(.+)$/m);
      if (m) {
        let v = m[1].trim();
        const inline = v.match(/^\[(.*)\]$/);
        if (inline) v = inline[1];
        const first = v.split(',')[0].trim().replace(/^["']|["']$/g, '');
        tag = first || '';
      }
    } catch {
      /* missing file → empty tag */
    }
    tagOf.set(id, tag);
  }
  return tagOf;
}

// --- Mean silhouette coefficient given a precomputed distance matrix + labels ---
function silhouette(dist, labels, k) {
  const n = labels.length;
  const members = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) members[labels[i]].push(i);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const ci = labels[i];
    const own = members[ci];
    let a = 0;
    if (own.length > 1) {
      for (const j of own) if (j !== i) a += dist[i][j];
      a /= own.length - 1;
    }
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === ci) continue;
      const m = members[c];
      if (m.length === 0) continue;
      let mean = 0;
      for (const j of m) mean += dist[i][j];
      mean /= m.length;
      if (mean < b) b = mean;
    }
    let s = 0;
    if (own.length > 1 && b !== Infinity) {
      const denom = Math.max(a, b);
      s = denom === 0 ? 0 : (b - a) / denom;
    }
    total += s;
  }
  return total / n;
}

function pairwiseDistances(vectors) {
  const n = vectors.length;
  const dist = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const vi = vectors[i];
    for (let j = i + 1; j < n; j++) {
      const vj = vectors[j];
      let s = 0;
      for (let d = 0; d < vi.length; d++) {
        const df = vi[d] - vj[d];
        s += df * df;
      }
      const dd = Math.sqrt(s);
      dist[i][j] = dd;
      dist[j][i] = dd;
    }
  }
  return dist;
}

// --- Pick k by silhouette over [K_MIN, K_MAX]; returns { k, clusters } ---
function clusterBySilhouette(vectors) {
  const n = vectors.length;
  const dist = pairwiseDistances(vectors);
  let best = null;
  const kMax = Math.min(K_MAX, n - 1);
  for (let k = K_MIN; k <= kMax; k++) {
    const res = kmeans(vectors, k, { seed: SEED, initialization: 'kmeans++', maxIterations: 100 });
    const score = silhouette(dist, res.clusters, k);
    if (!best || score > best.score) best = { k, score, clusters: res.clusters.slice() };
  }
  if (!best) return { k: 1, clusters: new Array(n).fill(0) };
  return { k: best.k, clusters: best.clusters };
}

function runUMAP(vectors) {
  const n = vectors.length;
  const nNeighbors = Math.max(2, Math.min(UMAP_N_NEIGHBORS, n - 1));
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors,
    minDist: UMAP_MIN_DIST,
    random: mulberry32(SEED),
  });
  return umap.fit(vectors); // number[n][3]
}

function buildTagLegend(usedTags) {
  const legend = [];
  const known = new Set(TAG_LEGEND.map((t) => t.id));
  for (const t of TAG_LEGEND) if (usedTags.has(t.id)) legend.push({ ...t });
  // Tags present in front-matter but absent from the canonical legend → append.
  let fi = 0;
  for (const id of [...usedTags].sort()) {
    if (!known.has(id)) {
      legend.push({ id, label: id, color: FALLBACK_PALETTE[fi % FALLBACK_PALETTE.length] });
      fi++;
    }
  }
  return legend;
}

// --- Relational edges over DOC centroids. Vectors are already L2-normalized, so
// cosine similarity == dot product. Emits two canonical, sorted, undirected edge
// sets (kNN + threshold) plus provenance meta. Doc-granularity only. ---
function computeEdges(docCentroids) {
  const n = docCentroids.length;

  // Symmetric cosine matrix via dot product; track observed range.
  const cos = Array.from({ length: n }, () => new Float64Array(n));
  let minCos = Infinity;
  let maxCos = -Infinity;
  for (let i = 0; i < n; i++) {
    const vi = docCentroids[i];
    for (let j = i + 1; j < n; j++) {
      const vj = docCentroids[j];
      let s = 0;
      for (let d = 0; d < DIM; d++) s += vi[d] * vj[d];
      cos[i][j] = s;
      cos[j][i] = s;
      if (s < minCos) minCos = s;
      if (s > maxCos) maxCos = s;
    }
  }

  // kNN: for each node, top-K by cosine (exclude self); add undirected (min,max)
  // to a Set keyed "s-t" (symmetric union — a node's degree may exceed K).
  const knnKeys = new Set();
  const k = Math.min(KNN_K, Math.max(0, n - 1));
  for (let i = 0; i < n; i++) {
    const order = [];
    for (let j = 0; j < n; j++) if (j !== i) order.push(j);
    order.sort((a, b) => cos[i][b] - cos[i][a]);
    for (let t = 0; t < k; t++) {
      const j = order[t];
      knnKeys.add(`${Math.min(i, j)}-${Math.max(i, j)}`);
    }
  }

  // Threshold: all C(n,2) pair cosines, sorted desc. Percentile mode keeps the
  // top `percentile` fraction; cutoff = cosine of the last kept pair. Absolute
  // mode keeps pairs with cosine >= EDGE_THRESHOLD_PERCENTILE (used as a constant).
  const pairs = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) pairs.push({ s: i, t: j, c: cos[i][j] });
  }
  pairs.sort((a, b) => b.c - a.c);

  let cutoff;
  let thresholdPairs;
  if (EDGE_THRESHOLD_MODE === 'percentile') {
    const keep = Math.max(1, Math.round(pairs.length * EDGE_THRESHOLD_PERCENTILE));
    thresholdPairs = pairs.slice(0, Math.min(keep, pairs.length));
    cutoff = thresholdPairs.length ? thresholdPairs[thresholdPairs.length - 1].c : 1;
  } else {
    cutoff = EDGE_THRESHOLD_PERCENTILE; // absolute cosine cutoff
    thresholdPairs = pairs.filter((p) => p.c >= cutoff);
  }

  // Canonicalize (s < t — already guaranteed by construction) and sort by (s, t).
  const byST = (a, b) => (a.s - b.s) || (a.t - b.t);

  const knn = [...knnKeys]
    .map((key) => {
      const [s, t] = key.split('-').map(Number);
      return { s, t, w: round(cos[s][t], EDGE_W_PRECISION) };
    })
    .sort(byST);

  const threshold = thresholdPairs
    .map((p) => ({ s: p.s, t: p.t, w: round(p.c, EDGE_W_PRECISION) }))
    .sort(byST);

  const meta = {
    knn: { k, count: knn.length },
    threshold: {
      mode: EDGE_THRESHOLD_MODE,
      percentile: EDGE_THRESHOLD_PERCENTILE,
      cutoff: round(cutoff, EDGE_W_PRECISION),
      count: threshold.length,
    },
    nodes: n,
    cosineRange: [
      round(Number.isFinite(minCos) ? minCos : 0, EDGE_W_PRECISION),
      round(Number.isFinite(maxCos) ? maxCos : 0, EDGE_W_PRECISION),
    ],
  };

  return { knn, threshold, meta };
}

function build() {
  // Belt-and-suspenders determinism: reset the global RNG at the start of every
  // build so write-mode and --check-mode draw the identical sequence. UMAP also
  // gets its own fresh seeded stream via the `random` option; k-means via `seed`.
  Math.random = mulberry32(SEED);

  const { guideDocs, chunks } = readIndex();
  const tagOf = readTags(guideDocs);

  // Deterministic ordering: chunks by (doc_id, chunk_index); docs by id.
  chunks.sort((a, b) => (a.doc_id < b.doc_id ? -1 : a.doc_id > b.doc_id ? 1 : a.chunk_index - b.chunk_index));
  const docIds = [...guideDocs.keys()].sort();

  // Doc centroid = re-normalized mean of L2-normalized chunk vectors.
  const chunksByDoc = new Map();
  for (const c of chunks) {
    if (!chunksByDoc.has(c.doc_id)) chunksByDoc.set(c.doc_id, []);
    chunksByDoc.get(c.doc_id).push(c);
  }
  const docCentroids = [];
  const docOrder = [];
  for (const id of docIds) {
    const cs = chunksByDoc.get(id) || [];
    if (cs.length === 0) continue; // no chunks → not embeddable, skip
    const mean = new Array(DIM).fill(0);
    for (const c of cs) for (let d = 0; d < DIM; d++) mean[d] += c.vec[d];
    for (let d = 0; d < DIM; d++) mean[d] /= cs.length;
    docCentroids.push(l2normalize(mean));
    docOrder.push({ id, chunkCount: cs.length });
  }

  const chunkVecs = chunks.map((c) => c.vec);

  // UMAP 384->3 for both granularities.
  const docPos = runUMAP(docCentroids);
  const chunkPos = runUMAP(chunkVecs);

  // k-means per granularity, k by silhouette.
  const docClus = clusterBySilhouette(docCentroids);
  const chunkClus = clusterBySilhouette(chunkVecs);

  const urlOf = (id) => {
    const t = guideDocs.get(id).type;
    return t === 'guide' ? `./guides/?guide=${id}` : `./guides/?type=${t}&guide=${id}`;
  };

  const docs = docOrder.map((d, i) => ({
    id: d.id,
    type: guideDocs.get(d.id).type,
    title: guideDocs.get(d.id).title,
    url: urlOf(d.id),
    tag: tagOf.get(d.id) || '',
    cluster: docClus.clusters[i],
    pos: [round(docPos[i][0], POS_PRECISION), round(docPos[i][1], POS_PRECISION), round(docPos[i][2], POS_PRECISION)],
    chunkCount: d.chunkCount,
    vecIndex: i,
  }));

  const chunkPoints = chunks.map((c, i) => ({
    id: `${c.doc_id}#${c.chunk_index}`,
    guide: c.doc_id,
    title: guideDocs.get(c.doc_id).title,
    heading: c.heading,
    url: urlOf(c.doc_id),
    tag: tagOf.get(c.doc_id) || '',
    cluster: chunkClus.clusters[i],
    pos: [round(chunkPos[i][0], POS_PRECISION), round(chunkPos[i][1], POS_PRECISION), round(chunkPos[i][2], POS_PRECISION)],
    vecIndex: i,
  }));

  const usedTags = new Set(docs.map((d) => d.tag).filter(Boolean));
  const tags = buildTagLegend(usedTags);

  // Relational edges over the doc centroids (doc-granularity only).
  const edges = computeEdges(docCentroids);

  const map = {
    schemaVersion: 2,
    model: MODEL,
    dim: DIM,
    generatedFrom: { docs: docs.length, chunks: chunkPoints.length },
    umap: { seed: SEED, nNeighbors: UMAP_N_NEIGHBORS, minDist: UMAP_MIN_DIST },
    clustering: { algo: 'kmeans', k: docClus.k, chosenBy: 'silhouette' },
    tags,
    docs,
    chunks: chunkPoints,
    edges,
  };

  // Binary vector buffers (row-major little-endian Float32, row r == vecIndex r).
  const guideBin = Buffer.alloc(docCentroids.length * DIM * 4);
  for (let i = 0; i < docCentroids.length; i++) {
    for (let d = 0; d < DIM; d++) guideBin.writeFloatLE(docCentroids[i][d], (i * DIM + d) * 4);
  }
  const chunkBin = Buffer.alloc(chunkVecs.length * DIM * 4);
  for (let i = 0; i < chunkVecs.length; i++) {
    for (let d = 0; d < DIM; d++) chunkBin.writeFloatLE(chunkVecs[i][d], (i * DIM + d) * 4);
  }

  const json = JSON.stringify(map, null, 2) + '\n';
  return { json, guideBin, chunkBin };
}

// The identity of what the map shows, without the float-noisy parts (positions,
// clusters, edge weights, vector bytes). See the --check note in the header.
const SEP = '\u0000';
function structureOf(map) {
  return {
    schemaVersion: map.schemaVersion,
    model: map.model,
    dim: map.dim,
    docs: (map.docs || []).map((d) => [d.id, d.type, d.title, d.url, d.tag, d.chunkCount, d.vecIndex].join(SEP)),
    chunks: (map.chunks || []).map((c) => [c.id, c.guide, c.heading, c.url, c.tag, c.vecIndex].join(SEP)),
    tags: (map.tags || []).map((t) => t.id),
  };
}

function checkStructure(artifacts, { jsonPath, guidePath, chunkPath }) {
  const problems = [];
  const rel = (p) => path.relative(REPO_ROOT, p);
  for (const p of [jsonPath, guidePath, chunkPath]) {
    if (!fs.existsSync(p)) problems.push(`missing: ${rel(p)}`);
  }
  if (problems.length) return problems;

  let committed;
  try {
    committed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  } catch (err) {
    return [`unparseable: ${rel(jsonPath)} (${err.message})`];
  }
  const want = structureOf(JSON.parse(artifacts.json));
  const have = structureOf(committed);

  for (const key of ['schemaVersion', 'model', 'dim']) {
    if (want[key] !== have[key]) problems.push(`${key}: committed ${have[key]}, fresh ${want[key]}`);
  }
  const show = (xs) => xs.slice(0, 5).map((x) => x.split(SEP).slice(0, 2).join(' ')).join(', ');
  for (const key of ['docs', 'chunks', 'tags']) {
    const w = new Set(want[key]);
    const h = new Set(have[key]);
    const missing = [...w].filter((x) => !h.has(x));
    const stale = [...h].filter((x) => !w.has(x));
    if (missing.length) problems.push(`${key}: ${missing.length} missing from committed map (e.g. ${show(missing)})`);
    if (stale.length) problems.push(`${key}: ${stale.length} stale in committed map (e.g. ${show(stale)})`);
  }
  // Vector files: one Float32 row per doc/chunk; only the size is stable across CPUs.
  for (const [p, buf] of [[guidePath, artifacts.guideBin], [chunkPath, artifacts.chunkBin]]) {
    const size = fs.statSync(p).size;
    if (size !== buf.length) problems.push(`size: ${rel(p)} (have ${size}B, want ${buf.length}B)`);
  }
  return problems;
}

function main() {
  const checkMode = process.argv.includes('--check');
  const artifacts = build();
  const jsonPath = path.join(OUT_DIR, 'embedding-map.json');
  const guidePath = path.join(OUT_DIR, 'guide-vectors.bin');
  const chunkPath = path.join(OUT_DIR, 'chunk-vectors.bin');

  if (checkMode) {
    const problems = checkStructure(artifacts, { jsonPath, guidePath, chunkPath });
    if (problems.length) {
      console.error('[build-embedding-map] --check FAILED — committed artifacts describe different docs than a fresh build:\n  ' + problems.join('\n  '));
      console.error('Regenerate with `node scripts/build-embedding-map.mjs` (or scripts/sync-docs.sh) and commit docs/data/.');
      process.exit(1);
    }
    console.log('[build-embedding-map] --check OK — committed artifacts match a fresh build (structure).');
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(jsonPath, artifacts.json);
  fs.writeFileSync(guidePath, artifacts.guideBin);
  fs.writeFileSync(chunkPath, artifacts.chunkBin);
  const map = JSON.parse(artifacts.json);
  console.log(
    `[build-embedding-map] wrote docs/data/embedding-map.json ` +
      `(docs=${map.docs.length}, chunks=${map.chunks.length}, k=${map.clustering.k}); ` +
      `edges(knn=${map.edges.knn.length}, thr=${map.edges.threshold.length}@cos\u2265${map.edges.meta.threshold.cutoff}); ` +
      `guide-vectors.bin=${artifacts.guideBin.length}B, chunk-vectors.bin=${artifacts.chunkBin.length}B`
  );
}

main();
