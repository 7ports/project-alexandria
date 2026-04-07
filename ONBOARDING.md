# Sauron Monitoring — Onboarding Guide

**Project:** project-alexandria — MCP Knowledge Base
**Monitoring type:** Hub-side Blackbox HTTP probing (no client-side agent required)
**Onboarded by:** Helldiver Squadron Beta · 2026-04-07

---

## Overview

Project Alexandria is monitored by **Sauron** (`https://sauron.7ports.ca`), a centralized
observability hub running Prometheus + Grafana on AWS EC2.

Because Alexandria's MCP server runs via **stdio transport** — it has no HTTP port and no
persistent host — monitoring is handled entirely on the Sauron hub side. Sauron's
**Blackbox Exporter** probes the GitHub Pages documentation site at regular intervals to
confirm it is reachable and responding correctly.

**No installation steps are required on your end.** Monitoring is already active.

---

## Why the MCP Server Cannot Be Probed Directly

The Alexandria MCP server (`mcp-server/index.js`) uses the
[Model Context Protocol](https://modelcontextprotocol.io/) stdio transport:

- It communicates via **stdin/stdout** with its parent process (Claude Code)
- It exposes **no HTTP port** — there is nothing for Prometheus or a health checker to reach
- It runs as an **ephemeral subprocess** with no persistent host address
- It has no `/metrics` endpoint or log files accessible externally

This is by design. The stdio transport is lightweight and requires no network access.
The trade-off is that external observability must use a proxy signal.

---

## What Is Monitored

Sauron's Prometheus Blackbox Exporter probes the following endpoint every **15 seconds**:

| URL | What is checked |
|---|---|
| `https://7ports.github.io/project-alexandria/` | HTTP uptime, response time, status code, TLS certificate expiry |

The docs site uptime is used as the **operational health proxy** for the project. If the
docs site is reachable and returning HTTP 200, the project is considered healthy for
monitoring purposes.

---

## Alert Rules

Sauron will fire alerts in the following conditions:

| Alert | Condition | Severity |
|---|---|---|
| `AlexandriaDocsDown` | Docs site returns a failure for > 2 minutes | Critical |
| `AlexandriaDocsHighLatency` | Response time exceeds 2 seconds for > 5 minutes | Warning |

Alert routing is managed by Sauron's Prometheus + (future) Alertmanager configuration.

---

## Dashboard

View monitoring data at: **https://sauron.7ports.ca**

- Dashboard name: **Project Alexandria — MCP Knowledge Base**
- Dashboard UID: `alexandria-overview`
- Navigate: Dashboards → Browse → `helldiver` tag

The dashboard includes:
- GitHub Pages uptime (UP/DOWN indicator)
- Response time history graph
- HTTP status code tracker
- Explanatory text about the stdio monitoring architecture

---

## How to Extend Monitoring

If Project Alexandria ever gains an HTTP API, admin web interface, or persistent
deployment target (e.g., Fly.io, EC2, Railway), re-run the Helldiver onboarding pipeline
to add:

1. **Alloy agent** — for host metrics (CPU, memory, disk) and container logs
2. **Additional Blackbox probes** — for each new HTTP endpoint
3. **Custom alert rules** — tailored to the new service type

To trigger a re-onboarding, open an issue on:
**https://github.com/7ports/project-sauron**
Title: `Helldiver re-onboarding request: project-alexandria`

---

## Contact

For questions about monitoring configuration or to request changes:
- Open an issue at https://github.com/7ports/project-sauron
- Contact Rajesh directly

## Metrics

When the following environment variables are set, the MCP server pushes Prometheus metrics to the Sauron observability platform every 30 seconds:

| Variable | Value |
|---|---|
| `SAURON_PUSHGATEWAY_URL` | `https://sauron.7ports.ca/metrics/gateway` |
| `PUSH_BEARER_TOKEN` | Obtain from Rajesh |
| `CLIENT_NAME` | `alexandria` |
| `CLIENT_ENV` | `production` |

If these variables are absent the server starts normally — metrics are silently disabled.

### Metrics emitted

| Metric | Type | Labels | Description |
|---|---|---|---|
| `mcp_tool_calls_total` | Counter | `tool`, `status`, `client`, `env` | All tool invocations by name and outcome |
| `mcp_tool_errors_total` | Counter | `tool`, `client`, `env` | Failed tool invocations |
| `mcp_tool_duration_seconds` | Gauge | `tool`, `client`, `env` | Duration of last call per tool (seconds) |
| `alexandria_guide_reads_total` | Counter | `guide`, `client`, `env` | Guide reads by name |
| `alexandria_guide_updates_total` | Counter | `guide`, `client`, `env` | Guide writes by name |
| `alexandria_search_queries_total` | Counter | `client`, `env` | Total search queries |
| `alexandria_guides_total` | Gauge | `client`, `env` | Total guides in the knowledge base |
