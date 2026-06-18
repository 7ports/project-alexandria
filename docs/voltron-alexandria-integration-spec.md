# Voltron-Side Change Spec: Adopting the Upgraded Alexandria

**Status:** Ready to implement (in project-voltron, not this repo)
**Target repo:** `project-voltron` — on the user's machine at
`C:/Users/Raj/Documents/nongamerepos/project-voltron`
**Scope:** Doc/contract only. **No MCP code change.** This repo (project-alexandria) cannot read or edit
project-voltron, so every change below is specified at the interface/contract level for a Voltron-side PR
that the user will land themselves.
**Source of truth:** `.voltron/analyses/alexandria-vectordb-design.md` (§ *Contract Changes*, § *Voltron
Integration*) and `.voltron/analyses/alexandria-sync-and-boundary-addendum.md` (§ *Reinforced Boundary
Wording*, Phase 13 note).

---

## 0. Why this is needed (context)

Alexandria gained a semantic (vector) layer and a generalized tool surface. The behavioral contract must
shift agents from *"consult guides before installing a tool"* to **"semantically recall before acting, and
record durable learnings after acting"** across all content types (guides, concepts, articles, references).

**New Alexandria MCP tool surface (already implemented and shipping):**

| New tool | Purpose | Legacy tool it generalizes |
|---|---|---|
| `recall_context` | Multi-type, dedup-by-doc briefing before acting | (new — primary read path) |
| `search_knowledge` | Semantic search across all content types | `search_guides` (lexical) |
| `read_knowledge` | Read a specific knowledge doc | `read_guide` |
| `write_knowledge` | Create/update a doc with a `type` (`guide`/`concept`/`article`/`reference`) | `update_guide` |
| `list_knowledge` | List docs across types | `list_guides` |
| `reindex_knowledge` | Rebuild the vector index | (new) |

**Legacy tools are retained** (`search_guides`, `read_guide`, `list_guides`, `update_guide`, `quick_setup`)
as aliases/fallbacks, so nothing breaks — but agent instructions should prefer the new tools.

---

## 1. Files that change in project-voltron

> All paths below are relative to the project-voltron repo root.

### 1a. `.claude/agents/*.md` — specialist agent templates

Each template's **"Alexandria Integration"** block must be updated to the new loop:
**`recall_context` before acting → `write_knowledge` after.**

- Replace any **`search_guides`-only** instruction with **`search_knowledge` / `recall_context`** (semantic).
- Replace any **`update_guide`-only** instruction with **`write_knowledge` + content-type guidance**
  (choose `type`: `guide` for setup steps, `concept` for a durable explanation, `article` for a
  synthesis/comparison, `reference` for a canonical pointer).
- Keep `quick_setup` mentions as-is (still valid for fast install steps).

**High-value templates to update (in priority order):**

| Agent template | File |
|---|---|
| scrum-master | `.claude/agents/scrum-master.md` |
| project-planner | `.claude/agents/project-planner.md` |
| code-analyst | `.claude/agents/code-analyst.md` |
| doc-writer | `.claude/agents/doc-writer.md` |
| fullstack-dev | `.claude/agents/fullstack-dev.md` |
| devops-engineer | `.claude/agents/devops-engineer.md` |
| config-editor | `.claude/agents/config-editor.md` |
| test-writer | `.claude/agents/test-writer.md` |

(Other `.claude/agents/*.md` templates carrying an Alexandria block should get the same treatment; the eight
above are the highest-value targets.)

**Exact replacement block to paste into each agent template's "Alexandria Integration" section**
(project-agnostic wording — safe for every agent):

```markdown
## Alexandria Integration

Alexandria is a shared, semantic knowledge base read by every Claude instance across all projects.

- **Before acting** (any tool setup or non-trivial technical decision), call `recall_context` (or
  `search_knowledge`) to retrieve what Alexandria already knows — guides, concepts, articles, and
  references. Use existing knowledge as your starting point instead of re-deriving it.
- Use `search_knowledge` / `recall_context` (semantic) as the default query surface. Only fall back to the
  lexical `search_guides` / direct `read_knowledge` markdown path for exact-string lookups or when the
  index is unavailable.
- **After acting** (set up a tool, resolved a problem, or discovered a reusable, project-agnostic insight),
  call `write_knowledge` with the correct `type` — `guide` for setup steps, `concept` for a durable
  explanation, `article` for a synthesis/comparison, `reference` for a canonical pointer. Write it in a
  single call.
- `quick_setup` remains available for fast install steps.
- **Boundary:** record ONLY general-purpose, reusable knowledge (see the content boundary rule). Project-,
  machine-, or account-specific detail stays in the project's CLAUDE.md.
```

### 1b. Voltron's own `CLAUDE.md` **and** the `CLAUDE.md` template it scaffolds

Update **"MCP Tools Available"** in both files. Replace the Alexandria bullet with the consumer one-liner in
§2.3 below. Both the repo's own `CLAUDE.md` and the template that `scaffold_project` writes into new projects
must carry identical wording so every scaffolded project inherits the new loop.

### 1c. Voltron onboarding / contract payload

Whatever file in project-voltron mirrors Alexandria's onboarding contract (e.g. an `onboarding.json` /
contract payload consumed by `get_onboarding` or by scaffolding) must mirror the three rule changes and the
reinforced boundary:

- `recall_before_acting` (replaces/generalizes `consult_before_setup`)
- `record_learnings` (replaces/generalizes `update_after_setup`)
- `query_before_search_guides` (new)
- `content_boundary` (replace text with the reinforced wording)

Exact text in §2 below. Per the Phase 13 note, the Voltron spec carries the **same reinforced boundary
wording** into both Voltron's onboarding payload and the consumer CLAUDE.md it scaffolds, so every scaffolded
project inherits the ironclad rule.

### 1d. `scaffold_project` recommendations / templates (verify, no functional change expected)

- Ensure the scaffolded `.mcp.json` keeps the `alexandria` server entry and the `mcp__alexandria__*`
  allowlist. **Verify only — no change expected** (the wildcard already covers the new tools; see §3).
- Ensure the generated CLAUDE.md carries the new Alexandria bullet (§2.3).
- If Voltron's `recommendations.json` carries always-surfaced setup guidance, add the read/write-loop text
  in §2.2.

### 1e. Docker passthrough (verify only)

Confirm containerized agents still mount Alexandria and reach the new tools (`Dockerfile.voltron` / run
scripts). No code change expected. *Interface note only — verify Voltron-side.*

### 1f. `src/index.js` (Voltron MCP) — **no change**

No `src/index.js` change is required. Voltron grants the tools via the `mcp__alexandria__*` wildcard and does
not proxy Alexandria tool names explicitly, so the new tools flow through unchanged. **Flag for verification,
not edit.**

---

## 2. Exact replacement text (copy-paste ready)

> The wording below is approved and project-agnostic where it quotes the contract. Paste verbatim.

### 2.1 Onboarding `behavioral_contract.rules`

**Replace `consult_before_setup` → `recall_before_acting`:**

> **id:** `recall_before_acting`
> **rule:** "Before setting up a tool **or making a non-trivial technical decision**, call
> `recall_context` (or `search_knowledge`) to retrieve what Alexandria already knows — guides, concepts,
> articles, and references. Use existing knowledge as your starting point instead of re-deriving it."
> **why:** "Semantic recall surfaces relevant prior learnings even when you don't know the exact keyword,
> preventing repeated research and repeated mistakes."

**Replace `update_after_setup` → `record_learnings`:**

> **id:** `record_learnings`
> **rule:** "After setting up a tool, resolving a problem, **or discovering a reusable, project-agnostic
> insight**, call `write_knowledge` with the correct `type` — `guide` for setup steps, `concept` for a
> durable explanation, `article` for a synthesis/comparison, `reference` for a canonical pointer. Write it
> in a single call."
> **why:** "The knowledge base only stays valuable if every instance contributes what it learns, in a form
> the next instance can semantically find."

**Add new rule `query_before_search_guides`:**

> **id:** `query_before_search_guides`
> **rule:** "Use `search_knowledge`/`recall_context` (semantic) as the default query surface. Only use the
> lexical `search_guides` / direct `read_knowledge` markdown path for exact-string lookups or when the
> index is unavailable."
> **why:** "The vector index is the primary access path; raw markdown is a rare fallback."

**Replace `content_boundary` text** (reinforced, self-testing — supersedes any lighter prior wording;
covers all content types in one canonical statement):

> **id:** `content_boundary`
> **rule:** "Alexandria stores ONLY general-purpose, reusable knowledge that is true independent of
> any specific machine, host, environment, client, customer, employer, team, repository, or project.
> Apply this positive test before every write — **'Would this exact text help an unrelated engineer
> on a completely different project who has never seen mine?'** If no, it does not belong in
> Alexandria. **NEVER record:** machine/host names, IP addresses, hostnames, OS usernames, or
> absolute filesystem paths tied to a person or box; secrets, credentials, API keys, tokens,
> passwords, connection strings, or private URLs; client, customer, employer, or project names;
> project architecture, business logic, feature designs, data models, internal endpoints, or team
> conventions; anything copied verbatim from a private repo. **DO record:** tool/framework/platform
> setup steps, version-compatibility notes, platform quirks, reusable error fixes, and general API
> usage patterns — with every project-, machine-, and account-specific value replaced by a generic
> placeholder (e.g. `<your-project>`, `<API_KEY>`, `<path/to/repo>`, `<hostname>`). When in doubt,
> leave it out and put it in the project's own CLAUDE.md instead."
> **why:** "Alexandria is a single shared library read by every Claude instance across all projects
> and machines. Any machine-, client-, or project-specific detail pollutes that shared library,
> misleads unrelated sessions, and — for secrets, paths, or hostnames — leaks private context into
> places it must never reach. Keeping Alexandria strictly general is what makes it safe to share and
> useful everywhere. This applies equally to every content type: guide, concept, article, and
> reference."

**Update `memory_templates`** (`project_memory` + `feedback_memory` content): replace guide-only phrasing so
they mention semantic recall/write and the new content types (`concept`/`article`/`reference`), not just
guides.

### 2.2 `recommendations.json` — always-surfaced setup guidance

Add to the always-surfaced text:

> "Equipped agents should **`recall_context` before acting and `write_knowledge` after** — Alexandria is a
> living source of truth, not a write-once doc set. New durable learnings go in as `concept`/`article`,
> not only `guide`."

(Also add a `reference`/`guide` pointer to the `vector-db-options` and `embeddings-local-vs-hosted` guides.)

### 2.3 Consumer `CLAUDE.md` one-liner (Voltron's own + scaffolded template)

Replace the Alexandria bullet under "MCP Tools Available":

> "**alexandria** — semantic knowledge base; **mandatory** — call `recall_context` (semantic) before any
> tool setup or non-trivial technical decision, and `write_knowledge` after to record reusable learnings
> (`guide`/`concept`/`article`/`reference`). `quick_setup` remains for fast install steps. Alexandria is for
> non-project-specific knowledge only — project specifics stay in CLAUDE.md."

---

## 3. Permissions & transport: nothing to change

- The new tools (`recall_context`, `search_knowledge`, `read_knowledge`, `write_knowledge`,
  `list_knowledge`, `reindex_knowledge`) are **already auto-permitted** via the existing wildcard
  **`mcp__alexandria__*`** in Voltron's `.mcp.json` / settings allowlist. No new permission entries needed.
- **No transport change.** Voltron already mounts the Alexandria MCP server; the new tools are served over
  the same connection.
- **No Voltron MCP code change.** `src/index.js` uses the wildcard and does not proxy Alexandria tool names,
  so the new surface flows through unchanged. Verify, don't edit.

**Net:** the Voltron-side PR is purely instructional/contract — agent templates, two CLAUDE.md files, and the
onboarding/recommendations payload. No functional MCP code.

---

## 4. Suggested Voltron PR checklist

- [ ] Update the eight high-value `.claude/agents/*.md` templates (§1a) with the new Alexandria Integration
      block; sweep remaining templates for stray `search_guides`/`update_guide`-only instructions.
- [ ] Update Voltron's own `CLAUDE.md` Alexandria bullet (§2.3).
- [ ] Update the `CLAUDE.md` template that `scaffold_project` writes (§2.3).
- [ ] Update the onboarding/contract payload: `recall_before_acting`, `record_learnings`,
      `query_before_search_guides`, reinforced `content_boundary`, `memory_templates` (§2.1).
- [ ] Update `recommendations.json` always-surfaced text + new-guide pointers (§2.2).
- [ ] Verify `.mcp.json` keeps the `alexandria` entry + `mcp__alexandria__*` allowlist (§1d, §3) — no change.
- [ ] Verify Docker passthrough reaches the new tools (§1e) — no change expected.
- [ ] Confirm `src/index.js` needs no edit (§1f).
- [ ] Validate: `get_onboarding` renders the new rules; onboarding/recommendations JSON parses.
