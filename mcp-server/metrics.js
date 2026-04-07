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

import { Registry, Counter, Gauge } from 'prom-client';

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
