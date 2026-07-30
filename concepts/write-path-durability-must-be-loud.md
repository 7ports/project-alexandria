---
id: write-path-durability-must-be-loud
type: concept
title: "Write-path durability must be loud, not fire-and-forget"
summary: A persistence layer that reports success before its remote sync is attempted will silently lose data for months. Return the real sync outcome; never fabricate a success field.
tags:
  - durability
  - git-automation
  - error-handling
  - mcp
  - silent-failure
  - api-design
status: active
embedding_version: 1
---

## The failure shape

A tool that persists content (a docs writer, a knowledge base, a sync daemon) reports success to its caller *before* the durable step has actually happened. Callers see "saved". Nothing reaches the remote. Nobody finds out for months.

Three ingredients combine, and each one alone is survivable — together they are silent, unbounded data loss:

1. **A fabricated success field.** The write path sets something like `committed = true` immediately after *enqueuing* an async sync, with a comment along the lines of `// sync enqueued`. The rich result the sync function actually returns is discarded.
2. **Fire-and-forget with a swallowing catch.** `Promise.resolve(sync(...)).catch(err => console.error(err))`. The rejection reaches a log nobody reads, never the caller.
3. **A hardcoded remote ref.** The sync pushes a literal branch name (`git push origin main`) instead of resolving the current branch. On any feature branch this pushes a *stale ancestor ref*, so git replies `Everything up-to-date` and **exits 0**. There is no error to swallow — the operation genuinely "succeeded" while propagating nothing.

Ingredient 3 is the nastiest: it defeats even correct error handling, because the failure is not an error.

## Why it survives review

Every layer looks defensible in isolation. Async sync is a reasonable latency choice. Logging a caught rejection looks like error handling. A default branch name looks like a sensible fallback. The bug lives in the *seam* between them, and no single-file review sees it.

It also produces a **confidence-destroying secondary symptom**: content is on disk and readable by list/read operations but missing from the remote and from any derived index. Users experience this as "the tool is flaky" or "I don't know how stale this is", which is much harder to report than a hard failure — so it goes unreported.

## The rule

**A write tool must return what actually happened, in enough detail for the caller to act.**

```
{ committed, pushed, branch, remote, reason, sync_conflict, error }
```

Not a boolean. A boolean cannot distinguish "on disk", "committed locally", "pushed to its own remote", and "merged to the trunk" — and those are four different durability guarantees. Pick which tier your API promises, name it explicitly, and report the tier actually reached.

Concretely:

- **Never fabricate a success field for work not yet done.** If you must stay async, return an explicit `pending`/`unknown` state — never `true`.
- **Never default a remote ref.** Resolve it (`git rev-parse --abbrev-ref HEAD`) and **fail loudly** if resolution fails. A fallback like `.catch(() => 'main')` re-introduces the whole bug the moment anything goes wrong. It is not a safety net; it is the trap.
- **Guard against the no-op success.** After a push, verify the remote ref's SHA matches local `HEAD`. An exit code of 0 is not proof that anything moved.
- **Surface failure in the response payload**, not only in logs. A caller that cannot see `pushed: false` cannot retry.
- **Collapse duplicate write paths.** If two entry points both persist content, they will drift, and only one will get fixed. Make the legacy one a thin delegate to the correct one — that single move can fix several bugs at once and prevents recurrence structurally.

## Detection

Silent staleness needs an explicit health surface, because a query layer that falls back only on *thrown* errors — and not on stale-empty results — cannot tell you it is serving stale data.

Expose a read-only health check that compares every source of truth and reports the set differences by name: files on disk vs rows in the index vs entries in the generated manifest vs what is committed vs what is on the trunk. Any divergence between those numbers is a bug you would otherwise never see. Reconcile counts *per source*, not as a single total — equal totals can still hide offsetting drift.

## Related

Applies to anything with an async durable step behind a synchronous-looking API: outbox/queue publishers, cache-write-through layers, CI artifact uploads, and any MCP server that persists on behalf of an agent. See also [[globally-registered-process-cwd-trap]].
