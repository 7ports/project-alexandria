---
id: vector-db-options
type: guide
title: "Vector Database Options: Embedded vs Managed"
summary: >
  Vector databases store embeddings alongside metadata and answer "nearest neighbor" queries efficiently.
tags: []
status: active
created: 2026-06-17
updated: 2026-06-17
embedding_version: 1
---

# Vector Database Options: Embedded vs Managed

## Quick Reference

Decision table — pick your row:

| Scenario | Option | Cost |
|---|---|---|
| Node.js agent, small corpus (< ~1M chunks), latency-sensitive | **sqlite-vec** (embedded) | $0 |
| Python-first or large local dataset | **LanceDB** (embedded) | $0 |
| Local dev team, wants REST API, can run extra process | **Chroma** (local server) | $0 |
| Prototype only, inactivity OK, don't need always-on | Free managed (Qdrant Cloud / Supabase / Pinecone) | $0 |
| Thin clients (browser/edge), many machines, always-on | Supabase Pro (pgvector) or Qdrant Cloud paid | ~$9–25/mo |
| Cheapest always-on, comfortable with ops | VPS (Hetzner / Lightsail / EC2) + self-hosted Qdrant | ~$5–7/mo |

**Install sqlite-vec (recommended embedded, Node.js):**

```bash
npm install better-sqlite3 sqlite-vec
```

---

## Overview

Vector databases store embeddings alongside metadata and answer "nearest neighbor" queries efficiently. The key fork in the road is **embedded vs. server**: embedded runs in-process with zero infrastructure; server-based adds a network hop and a process to keep alive. Free managed tiers exist but carry an auto-suspend gotcha that disqualifies them for always-available knowledge bases.

This guide focuses on the most common options for small-to-medium agent/RAG workloads and helps you pick the right tier before committing.

---

## Embedded Options (In-Process, $0)

### sqlite-vec

sqlite-vec is a SQLite extension that adds a `vec0` virtual table for KNN vector search. It runs in the same process as your Node.js (or Python) app — no server, no network, sub-millisecond reads.

**Key facts:**
- v0.1.9 stable (March 2026), 800+ npm dependents
- SIMD-accelerated on x86/arm64
- 384-dimension vectors (covers `all-MiniLM-L6-v2` and similar embedding models)
- Storage: a single `.db` file — gitignore it, it's rebuildable from source

**Setup (Node.js):**

```bash
npm install better-sqlite3 sqlite-vec
```

```javascript
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const db = new Database('vectors.db');
sqliteVec.load(db);

// Create a virtual table for 384-dim embeddings
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING vec0(
    embedding FLOAT[384]
  );
`);

// Insert
const insert = db.prepare('INSERT INTO chunks(rowid, embedding) VALUES (?, ?)');
insert.run(chunkId, JSON.stringify(embeddingArray));

// KNN query — top 5 nearest
const search = db.prepare(`
  SELECT rowid, distance
  FROM chunks
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT 5
`);
const results = search.all(JSON.stringify(queryEmbedding));
```

**Gitignore:**

```
vectors.db
vectors.db-shm
vectors.db-wal
```

**When to use:** corpus is small to medium (< ~1M chunks), clients can bundle native deps + ~120MB embedding model, reads are frequent and latency-sensitive, $0 is a requirement.

---

### LanceDB

Columnar embedded vector store. Stronger than sqlite-vec for large local datasets and Python-first workflows.

- Written in Rust, bindings for Python and Node.js
- Better than sqlite-vec for larger-than-RAM datasets (columnar paging)
- Heavier dependency footprint; takes longer to install
- Not the default choice for Node.js in-process use at low chunk counts

**When to use:** Python-first project, or local corpus exceeds tens of millions of chunks.

---

## Local Server Options ($0, But Needs a Running Process)

### Chroma

Chroma is an open-source vector database with a Python SDK and a REST API server you run locally.

- Start with `chroma run --path ./chroma-data`
- Client talks to `http://localhost:8000`
- Good fit for local dev teams who want a shared REST endpoint without cloud accounts
- More moving parts than embedded: the server must be running before your app starts

**When to use:** local dev team, you want a REST API, everyone can run the extra process, and you don't need offline/in-process operation.

**Avoid if:** you need zero-infrastructure deploys or always-on availability without babysitting a process.

---

## Managed Cloud Options

### Free Tiers — Read This Before Using

> **Caution: Free managed tiers auto-suspend and auto-delete.**
>
> All major free tiers have inactivity policies that make them unreliable as a source-of-truth for agents that write continuously or need always-available retrieval:
>
> | Provider | Suspend policy | Delete policy |
> |---|---|---|
> | **Qdrant Cloud free** | ~1 week idle | ~4 weeks idle |
> | **Supabase free project** | Pauses on inactivity | Manual reactivation required |
> | **Pinecone free** | Account-bound; no suspend, but vendor lock-in | N/A |
>
> **Do not use free managed tiers as always-available knowledge bases.** They are fine for prototyping and one-off experiments where downtime is acceptable. Use embedded or paid managed for production agents.

---

### Paid Managed Tiers (No Auto-Suspend)

Paid plans skip the suspend policies. You pay for always-on access and provider-managed infrastructure. Network RTT of 10–100 ms+ on every read is the trade-off vs. embedded.

| Provider | Rough cost | Notes |
|---|---|---|
| **Supabase Pro** (pgvector) | ~$25/mo | pgvector included; no scale-to-zero; SQL familiarity; good for relational + vector in one DB |
| **Qdrant Cloud dedicated** | ~$9–25/mo | Purpose-built for vectors; strong filtering; good client libraries |
| **Neon paid** (pgvector) | ~$19–25+/mo | Must explicitly disable scale-to-zero; otherwise acts like a free tier |

**When to use paid managed:**
- Thin clients (browser, edge functions) that can't bundle native deps or a local embedding model
- Multiple machines need live cross-instance freshness (embedded doesn't share across processes)
- Corpus is too large to keep locally
- You want provider-managed backups, TLS, and uptime SLAs

---

### Self-Hosted VPS

Cheapest always-on option. You run Qdrant (or Chroma) on a cheap VPS.

| Provider | Instance | Rough cost |
|---|---|---|
| Hetzner | CX22 | ~$5/mo |
| AWS Lightsail | Micro | ~$7/mo |
| AWS EC2 | t4g.micro | ~$7/mo |

You own patching, backups, TLS termination, and process monitoring. For a small docs corpus the ops cost in time frequently exceeds the dollar savings over a $9/mo managed plan. Only choose self-hosted if you already have VPS ops experience and are running other workloads on the same box.

---

## Trade-Off Summary

| Factor | Embedded | Local server | Free managed | Paid managed | Self-hosted VPS |
|---|---|---|---|---|---|
| Cost | $0 | $0 | $0 | $9–25/mo | $5–7/mo |
| Read latency | Sub-ms | Sub-ms (LAN) | 10–100 ms | 10–100 ms | 10–100 ms |
| Always-on | Yes (in-process) | Needs running process | No (suspends) | Yes | Yes (ops burden) |
| Multi-machine | No | Yes (LAN) | Yes | Yes | Yes |
| Ops burden | None | Low | None (dev only) | None | High |
| Offline capable | Yes | Yes | No | No | No |
| Rebuildable | Yes | Yes | Depends | Depends | Yes |

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `sqlite-vec` install fails on Windows | Requires node-gyp + MSVC build tools. Run `npm install --global windows-build-tools` (admin PowerShell) first, or use WSL2 |
| `better-sqlite3` binding mismatch after `nvm use` | Rebuild: `npm rebuild better-sqlite3` |
| sqlite-vec `vec0` table not found | `sqliteVec.load(db)` must be called before any SQL that references `vec0`; extension load is per-connection |
| Chroma server not reachable | Confirm `chroma run` is running and `CHROMA_SERVER_HOST` / port match. Default is `localhost:8000` |
| Supabase free project paused | Log in to Supabase dashboard → restore project. Consider upgrading to Pro or switching to embedded |
| Qdrant Cloud collection missing after idle | Free cluster was suspended/deleted. Rebuild from source-of-record. Use paid tier to avoid recurrence |
| High read latency on managed tier | Expected: 10–100 ms RTT. If latency is critical, switch to embedded sqlite-vec |
| Embedding dimension mismatch on insert | `vec0` table column dimension must match your model output exactly (e.g., `FLOAT[384]` for MiniLM, `FLOAT[1536]` for OpenAI `text-embedding-3-small`) |

---

## Platform Notes

**Windows 10 / WSL2:**
- `sqlite-vec` has native bindings (C extension). Building on Windows native requires MSVC build tools; building inside WSL2 is simpler and the recommended path for local development.
- `better-sqlite3` similarly requires native compilation. The WSL2 path avoids most Windows-specific build failures.
- If running the Node.js app in a Docker container (via `Dockerfile.voltron`), the Linux build inside the container avoids all Windows build-tool issues — the recommended approach for agent workloads.
- LanceDB also ships native binaries; prefer WSL2 or Docker on Windows.
- Chroma's Python server runs cleanly under WSL2; running it natively on Windows is possible but less tested.

**File paths:**
- Keep the `.db` file inside your project directory (not a Windows path accessed from WSL2) to avoid permission and performance issues from cross-filesystem access.

---

## Related Guides

- [Project Voltron Docker](project-voltron-docker.md) — containerised agent environment where embedded sqlite-vec runs cleanly without Windows build-tool issues
- [Express 5 + Node.js 20 + TypeScript](express-5-node-typescript.md) — server pattern for wrapping vector search behind an API

---

## References

- [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec)
- [sqlite-vec npm package](https://www.npmjs.com/package/sqlite-vec)
- [better-sqlite3 npm package](https://www.npmjs.com/package/better-sqlite3)
- [LanceDB documentation](https://lancedb.github.io/lancedb/)
- [Chroma documentation](https://docs.trychroma.com/)
- [Qdrant Cloud pricing](https://qdrant.tech/pricing/)
- [Supabase pricing](https://supabase.com/pricing)
- [Neon pricing](https://neon.tech/pricing)

---

*Last updated: 2026-06-17*
