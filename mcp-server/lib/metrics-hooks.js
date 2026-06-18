'use strict';

/**
 * metrics-hooks.js — CommonJS bridge to the ESM mcp-server/metrics.js module.
 *
 * CJS lib modules (embedder, git-sync, reindex) cannot `require()` an ESM
 * module directly, so this file uses a dynamic `import()` — valid in CJS
 * since Node.js 12 — to load metrics.js once and cache its exports. Until
 * that promise resolves (a few ms at startup) every call is a silent no-op;
 * after that, calls are synchronous delegations to the ESM helpers. Dropped
 * increments during the tiny startup window are acceptable for telemetry.
 *
 * Instrumented helpers mirror the exports of metrics.js § "Phase-8 helpers":
 *   recordEmbedLatency, incSemanticQuery, incLexicalFallback,
 *   incSyncRetry, incSyncFailure, incSyncConflict,
 *   setLastSyncAge, addReembedded, setIndexSize
 */

let _m = null;
let _loading = false;

function _load() {
  if (_loading) return;
  _loading = true;
  // Dynamic import() resolves the ESM module; path is relative to this file.
  import('../metrics.js')
    .then((mod) => { _m = mod; })
    .catch(() => { /* metrics.js unavailable — all helpers remain no-ops */ });
}

// Kick off the load immediately so helpers resolve before first real call.
_load();

function recordEmbedLatency(seconds) { _m && _m.recordEmbedLatency(seconds); }
function incSemanticQuery()           { _m && _m.incSemanticQuery(); }
function incLexicalFallback()         { _m && _m.incLexicalFallback(); }
function incSyncRetry()               { _m && _m.incSyncRetry(); }
function incSyncFailure()             { _m && _m.incSyncFailure(); }
function incSyncConflict()            { _m && _m.incSyncConflict(); }
function setLastSyncAge(epochMs)      { _m && _m.setLastSyncAge(epochMs); }
function addReembedded(n)             { _m && _m.addReembedded(n); }
function setIndexSize(kind, count)    { _m && _m.setIndexSize(kind, count); }

module.exports = {
  recordEmbedLatency,
  incSemanticQuery,
  incLexicalFallback,
  incSyncRetry,
  incSyncFailure,
  incSyncConflict,
  setLastSyncAge,
  addReembedded,
  setIndexSize,
};
