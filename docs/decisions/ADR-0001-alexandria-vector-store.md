# ADR-0001: Alexandria Vector Store — In-Process sqlite-vec + Local Embeddings + Git-Sync

## Status
Accepted — 2026-06-17

## Context

Alexandria is a Node.js MCP server that exposes project-agnostic tooling documentation as markdown files. Its original search implementation was a case-insensitive substring scan — fast enough for ~40 guides, but unable to match semantically related terms or surface relevant results when query wording diverges from guide text. We needed to add vector (semantic) search.

Three architectural options were evaluated:

**Option A — In-process embedded store (chosen).** sqlite-vec (vec0 virtual table) running inside better-sqlite3, with embeddings generated locally via @huggingface/transformers. The index is a gitignored derived artifact; the markdown files in git are the source of record and the index is always rebuildable from them.

**Option B — Always-on self-hosted server.** A dedicated vector-DB process (e.g., Qdrant or Weaviate running in Docker). The singular advantage over Option A is sub-second cross-machine freshness. At our write rate (a handful of docs/day across 1–4 machines), the probability that a cross-machine query lands in the ~120-second window after a just-written document is near-zero per day. This advantage does not materialize in practice. Against that: self-hosting adds ops burden (TLS, patching, backups, uptime monitoring) for a corpus that can be rebuilt from git in seconds, and it regresses the dominant path — read-heavy agent recall — from sub-millisecond local reads to 10–100 ms+ network RTT.

**Option C — Managed hosted vector DB.** Free tiers of Qdrant Cloud, Supabase, and Pinecone were evaluated. All three are disqualified as a source-of-truth for agents that must reach the store on every task: Qdrant Cloud free auto-suspends after ~1 week idle and auto-deletes after ~4 weeks; Supabase free pauses on inactivity; Pinecone free is account-bound with vendor lock-in. Paid managed tiers (Supabase Pro ~$25/mo, Qdrant Cloud paid ~$9–25/mo) are viable but exceed the budget constraint of $0/month (hard ceiling $5/month) at the current corpus size and instance count.

Constraints at decision time: $0/month standing infra cost preferred (≤$5/month hard ceiling); Windows 10 dev machine; corpus of ~40 guides growing to low-thousands of chunks maximum; write pattern of a handful of docs/day across 1–4 owner-controlled machines; read-heavy access pattern with agents calling recall before every task; not a public multi-tenant service.

## Decision

We adopt an in-process, embedded vector store for Alexandria with the following stack:

- **Vector store:** sqlite-vec v0.1.9 (vec0 virtual table) via better-sqlite3. The index lives in a single `.db` file that is gitignored and treated as a rebuildable cache.
- **Embedding model:** `Xenova/bge-small-en-v1.5` (384-dimensional ONNX) via `@huggingface/transformers`, running in-process in Node.js. Model weights (~120 MB) are downloaded once per machine. Queries use the `query:` prefix; passages use the `passage:` prefix as required by the model.
- **SQLite driver:** better-sqlite3, chosen for its synchronous API and prebuilt Windows binaries, which simplify in-process integration and avoid native compilation on the primary platform.
- **Source of record:** git-tracked markdown files under `guides/` and any future content directories. The index is always derived from and rebuildable from these files. Git provides versioning, diffs, review history, and offsite durability via push — the same properties one would otherwise reach for a server to provide.
- **Cross-machine sync:** git pull/push. Index rebuild on each machine is content-hash-idempotent, making it cheap in practice. A bounded ~2-minute staleness window is accepted as the cross-machine consistency model.

## Consequences

### Positive

We pay $0/month in standing infrastructure costs. The dominant read path — agent recall before every task — executes at sub-millisecond local KNN latency, faster than any option that crosses a network. The system is fully offline-capable with no API keys to provision or rotate across agent instances. There is no new always-on dependency and no ops burden: no process to patch, back up, or monitor. Embed-on-write is free at marginal cost because all computation is local and in-process, which matters because agents write continually. Git already provides the durability, versioning, and offsite backup properties that a server architecture would otherwise need to supply.

### Negative / Trade-offs

Cross-machine consistency is eventual, bounded by the git-sync interval (~2 minutes). A cross-machine query for a document written on another machine within that window may return a stale or missing result; we mitigate this with a lexical fallback during index rebuild. Each machine must download the ~120 MB model once and maintain its own index file. better-sqlite3 requires prebuilt native binaries; these are available for Windows x64 but may require Visual Studio Build Tools if no prebuilt matches the Node.js version in use.

### When to Revisit

1. **Write volume rises 10–100x** (dozens of writes per hour): tighten `SYNC_TTL` first; if that is insufficient, a server becomes justified.
2. **Alexandria becomes multi-tenant** (opened to teammates or other teams at meaningful scale): the number of instances and consistency threshold cross the break-even point for a server.
3. **Thin clients enter the picture** (browser extension, mobile): embedding must move server-side as these clients cannot run the ONNX model in-process.
4. **Corpus grows to millions of chunks**: local re-embed on rebuild becomes slow enough to matter.
5. **A hard sub-second cross-machine freshness requirement appears**: the ~2-minute staleness window is no longer acceptable.

If any of these triggers fire, prefer a paid managed service (Supabase Pro or Qdrant Cloud paid) over self-hosted — managed avoids the ops burden that makes self-hosting a poor trade at small scale.
