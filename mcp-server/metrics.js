/**
 * Prometheus metrics for Project Alexandria MCP server.
 * Pushes to Sauron Pushgateway every 30s (fire-and-forget — never blocks tool calls).
 *
 * Optional env vars (metrics silently disabled if absent):
 *   SAURON_PUSHGATEWAY_URL   https://sauron.7ports.ca/metrics/gateway
 *   PUSH_BEARER_TOKEN        Sauron nginx bearer token
 *   CLIENT_NAME              alexandria  (default)
 *   CLIENT_ENV               production  (default)
 */

import { Registry, Counter, Gauge, Histogram } from 'prom-client';

const CLIENT = process.env.CLIENT_NAME ?? 'alexandria';
const ENV    = process.env.CLIENT_ENV  ?? 'production';

export const registry = new Registry();
registry.setDefaultLabels({ client: CLIENT, env: ENV });

// ── Standard MCP tool metrics ──────────────────────────────────────────────
export const toolCallsTotal = new Counter({
  name: 'mcp_tool_calls_total',
  help: 'Total MCP tool invocations by name and outcome',
  labelNames: ['tool', 'status'],
  registers: [registry],
});

export const toolErrorsTotal = new Counter({
  name: 'mcp_tool_errors_total',
  help: 'MCP tool invocations that threw an exception',
  labelNames: ['tool'],
  registers: [registry],
});

export const toolDurationSeconds = new Gauge({
  name: 'mcp_tool_duration_seconds',
  help: 'Duration of last MCP tool call in seconds',
  labelNames: ['tool'],
  registers: [registry],
});

// ── Alexandria domain metrics ──────────────────────────────────────────────
export const guideReadsTotal = new Counter({
  name: 'alexandria_guide_reads_total',
  help: 'Guide read operations by guide name',
  labelNames: ['guide'],
  registers: [registry],
});

export const guideUpdatesTotal = new Counter({
  name: 'alexandria_guide_updates_total',
  help: 'Guide create/update operations by guide name',
  labelNames: ['guide'],
  registers: [registry],
});

export const searchQueriesTotal = new Counter({
  name: 'alexandria_search_queries_total',
  help: 'Total search_guides invocations',
  registers: [registry],
});

export const guidesTotal = new Gauge({
  name: 'alexandria_guides_total',
  help: 'Current number of guides in the knowledge base',
  registers: [registry],
});

// ── Vector-DB / sync metrics (Phase 8) ────────────────────────────────────
export const embedLatencySeconds = new Histogram({
  name: 'embed_latency_seconds',
  help: 'Seconds to embed a single chunk (passage or query) via the local model',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [registry],
});

export const knowledgeIndexSize = new Gauge({
  name: 'knowledge_index_size',
  help: 'Current count of documents or chunks in the sqlite-vec knowledge index',
  labelNames: ['kind'],
  registers: [registry],
});

export const semanticQueryTotal = new Counter({
  name: 'semantic_query_total',
  help: 'Total semantic (KNN) search_knowledge queries executed',
  registers: [registry],
});

export const lexicalFallbackTotal = new Counter({
  name: 'lexical_fallback_total',
  help: 'Total times search degraded to lexical (substring) fallback',
  registers: [registry],
});

export const syncPushRetriesTotal = new Counter({
  name: 'sync_push_retries_total',
  help: 'Total non-fast-forward push retries inside syncCommitAndPush',
  registers: [registry],
});

export const syncPushFailuresTotal = new Counter({
  name: 'sync_push_failures_total',
  help: 'Total push sequences that exhausted all retries without a successful push',
  registers: [registry],
});

export const syncConflictsTotal = new Counter({
  name: 'sync_conflicts_total',
  help: 'Total rebase conflicts aborted during sync (requires manual reconciliation)',
  registers: [registry],
});

// Tracks the epoch-ms of the last successful push so collect() can derive age.
let _lastSyncOkMs = null;
export const lastSyncAgeSeconds = new Gauge({
  name: 'last_sync_age_seconds',
  help: 'Seconds since the last successful git push (unset until first push succeeds)',
  registers: [registry],
  collect() {
    if (_lastSyncOkMs !== null) {
      this.set((Date.now() - _lastSyncOkMs) / 1000);
    }
  },
});

export const reconcileDocsReembeddedTotal = new Counter({
  name: 'reconcile_docs_reembedded_total',
  help: 'Total documents re-embedded during incremental index reconciliation after a pull',
  registers: [registry],
});

// ── Phase-8 helper functions (called by CJS lib modules via metrics-hooks.js) ─
export function recordEmbedLatency(seconds) { embedLatencySeconds.observe(seconds); }
export function incSemanticQuery()           { semanticQueryTotal.inc(); }
export function incLexicalFallback()         { lexicalFallbackTotal.inc(); }
export function incSyncRetry()               { syncPushRetriesTotal.inc(); }
export function incSyncFailure()             { syncPushFailuresTotal.inc(); }
export function incSyncConflict()            { syncConflictsTotal.inc(); }
/** Record the epoch-ms of the last successful push; the gauge auto-computes age at scrape time. */
export function setLastSyncAge(epochMs)      { _lastSyncOkMs = epochMs; }
export function addReembedded(n)             { reconcileDocsReembeddedTotal.inc(n ?? 1); }
export function setIndexSize(kind, count)    { knowledgeIndexSize.set({ kind }, count); }

// ── Pushgateway ────────────────────────────────────────────────────────────
const PUSH_URL   = process.env.SAURON_PUSHGATEWAY_URL;
const PUSH_TOKEN = process.env.PUSH_BEARER_TOKEN;
const enabled    = !!(PUSH_URL && PUSH_TOKEN);

if (!enabled) {
  process.stderr.write(
    '[alexandria/metrics] SAURON_PUSHGATEWAY_URL or PUSH_BEARER_TOKEN not set — metrics disabled\n'
  );
}

export async function pushMetrics() {
  if (!enabled) return;
  try {
    const body = await registry.metrics();
    const res  = await fetch(`${PUSH_URL}/metrics/job/${CLIENT}`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${PUSH_TOKEN}`,
        'Content-Type': 'text/plain; version=0.0.4',
      },
      body,
    });
    if (!res.ok) {
      process.stderr.write(`[alexandria/metrics] push HTTP ${res.status}\n`);
    }
  } catch (err) {
    process.stderr.write(`[alexandria/metrics] push error: ${err.message}\n`);
  }
}

if (enabled) setInterval(pushMetrics, 30_000).unref();

async function shutdown() { await pushMetrics(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT',  shutdown);

// ── Tool wrapper ───────────────────────────────────────────────────────────
export async function withMetrics(toolName, fn) {
  const start = performance.now();
  try {
    const result = await fn();
    toolCallsTotal.inc({ tool: toolName, status: 'success' });
    toolDurationSeconds.set({ tool: toolName }, (performance.now() - start) / 1000);
    return result;
  } catch (err) {
    toolCallsTotal.inc({ tool: toolName, status: 'error' });
    toolErrorsTotal.inc({ tool: toolName });
    toolDurationSeconds.set({ tool: toolName }, (performance.now() - start) / 1000);
    throw err;
  }
}
