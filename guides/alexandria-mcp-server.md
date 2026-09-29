---
id: alexandria-mcp-server
type: guide
title: "Alexandria MCP Server"
summary: >
  A custom MCP server that exposes Project Alexandria's tooling setup guides as searchable, queryable resources.
tags: [mcp-server]
status: active
created: 2026-06-17
updated: 2026-09-28
embedding_version: 1
---

# Alexandria MCP Server

## Quick Reference

**Install:**
```bash
cd /path/to/project-alexandria/mcp-server && npm install
```

**Claude Code config** (`~/.claude.json` → `mcpServers`):
```json
{
  "alexandria": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/project-alexandria/mcp-server/index.js"]
  }
}
```

**Permissions** (`~/.claude/settings.json` → `permissions.allow`): `"mcp__alexandria__*"`

**First use:** Call `get_onboarding` to adopt the collaborative maintenance contract.

## Overview

A custom MCP server that exposes Project Alexandria's tooling setup guides as searchable, queryable resources. This allows Claude to access documentation about previously set up tools from any project, making future tool setups faster and more reliable.

## Prerequisites

- Node.js (v18+)
- Project Alexandria repository cloned/present at its expected location

## Installation

### Step 1: Install Dependencies

```bash
cd /path/to/project-alexandria/mcp-server
npm install
```

### Step 2: Add to Claude Code Config

Add to your `~/.claude.json` under `"mcpServers"`:

```json
{
  "alexandria": {
    "type": "stdio",
    "command": "node",
    "args": [
      "C:/Users/Raj/Documents/nongamerepos/project-alexandria/mcp-server/index.js"
    ],
    "env": {}
  }
}
```

Adjust the path to match where Project Alexandria lives on your system.

### Step 3: Add Permissions

In `~/.claude/settings.json`, add to the `permissions.allow` array:

```json
"mcp__alexandria__*"
```

### Step 4: Onboard Your Claude Instance

After restarting Claude Code, call the `get_onboarding` tool. This returns the full behavioral contract and memory templates that the Claude instance should adopt. The instance should save the provided memory templates to its memory system so the maintenance obligations persist across conversations.

```
get_onboarding → returns collaborative maintenance contract + memory templates
```

This step is what makes each Claude instance a collaborative maintainer of the shared knowledge base.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_guides` | List all available tooling setup guides with summaries |
| `read_guide` | Read the full content of a specific guide by name |
| `search_guides` | Search for keywords across all guides |
| `update_guide` | Update an existing guide or create a new one |
| `get_guide_template` | Get the template for creating new guides |
| `get_project_setup_recommendations` | Get required/recommended tools when setting up a new project |
| `get_onboarding` | Get the collaborative maintenance contract for a new Claude instance |

## Usage Examples

### List all guides
```
list_guides → returns all guide names and summaries
```

### Read a specific guide
```
read_guide(name: "coplay-mcp-server") → full CoPlay setup docs
```

### Search across guides
```
search_guides(query: "uvx") → all guides mentioning uvx
```

### Update a guide after learning something new
```
update_guide(name: "my-tool", content: "# My Tool\n\n...") → creates/updates guide
```

## Knowledge docs vs guides (newer tool surface)

The table above lists the original guide-only tools. The server now also exposes typed knowledge
docs — `guide`, `concept`, `article`, `reference` — through a second set of tools:

| Tool | Notes |
|------|-------|
| `write_knowledge` | Create/update ANY type. **Composes frontmatter from a `metadata` argument** (title, summary, tags, status, source_urls). Prefer this. |
| `read_knowledge` / `list_knowledge` | Read and list across all types |
| `search_knowledge` | Primary search. Semantic when the vector index is up, lexical substring otherwise |
| `recall_context` | Topic briefing; wrapper over `search_knowledge` |
| `reindex_knowledge` | Rebuild the vector index from the markdown source-of-record |

### Frontmatter is merged, not recomposed (fixed 2026-09-28)

`update_guide` passes no metadata, and `writeKnowledge` used to compose frontmatter from the
**name only** — so every body-only edit destroyed `title`, `summary` and `tags`, and the title
silently became the slug. `Coplay (now Aura) — Unity Plugin & MCP` came back as
`coplay-unity-mcp` in every listing, and nothing surfaced the loss until someone ran
`list_guides` much later.

The single write path now reads the existing frontmatter off disk and merges caller metadata over
it field-by-field, so partial updates still work and omitted fields survive. If you are running an
older build, use `write_knowledge` with a full `metadata` block for edits.

## Semantic search requires native modules — and says so when they are missing

`search_knowledge` and `recall_context` fall back to a **lexical substring scan** when the vector
index cannot load. That is the right runtime behaviour (answers keep flowing) and a terrible
diagnostic, because in lexical mode a natural-language question matches nothing:
`"Unity humanoid animation root motion RootT.y sinking through floor"` returned nothing while the
single keyword `"Mecanim"` returned two documents containing exactly that content.

The server used to answer both cases — empty corpus and broken index — with the same confident
sentence, *"No guide covers this yet"*. Sessions believed it and rewrote knowledge that already
existed. Since 2026-09-28 a degraded read is announced in the tool output itself:

```
!! DEGRADED READ PATH — the semantic index is unavailable, so this ran as a
case-insensitive SUBSTRING scan over the markdown...
```

`recall_context` reports its mode alongside the rows for the same reason — a caller that receives
only rows cannot tell an empty corpus from a broken index.

> **If you see that banner, or an empty recall, retry with one or two keywords** before concluding
> nothing exists.

### Diagnosing it

```bash
cd mcp-server && npm run doctor
```

`doctor` names the cause and the remedy, and exits non-zero when the semantic path is degraded.
CI runs it on Linux and Windows across Node 22 and 24, because none of these failures are visible
on a single platform.

### Requirements

`better-sqlite3` + `sqlite-vec`, both with binaries matching the **host** platform and Node ABI.

| Symptom | Cause | Fix |
|---|---|---|
| `Vector index unavailable — reindex skipped` | extension cannot load | `npm run doctor` |
| only `sqlite-vec-linux-x64` present on a Windows host | `node_modules` populated in a Linux/Docker context | delete `node_modules`, `npm install` on the host that runs the server |
| `better_sqlite3.node is not a valid Win32 application` | same — the compiled binding is a Linux build | as above |
| `npm rebuild better-sqlite3` fails in node-gyp | the pinned version has no prebuild for your Node (e.g. `better-sqlite3@9` on Node 24), so it must compile, which needs a C++ toolchain | bump to `better-sqlite3@^12.11.1` and run Node **22+** (prebuilds for 22/24/25/26 on every OS; there is **no Windows prebuild for Node 20**, which is EOL anyway) rather than installing build tools |

Do **not** work around a missing platform package by adding it to `dependencies`: those packages
declare `os`/`cpu` constraints, so pinning `sqlite-vec-windows-x64` directly breaks `npm install`
for everyone else. `sqlite-vec` already lists all platforms as `optionalDependencies`; a clean
install on the target host resolves the right one.

**The root cause is almost always one `node_modules` serving two platforms** — a container and its
host sharing a bind-mounted checkout. Keep `node_modules` out of the image (`.dockerignore`) and
install separately in each.

Note `require('better-sqlite3')` can succeed while broken — the binding is not loaded until a
`Database` is instantiated. Test properly:

```js
const v = require('sqlite-vec'), Database = require('better-sqlite3');
const db = new Database(':memory:'); v.load(db);
console.log(db.prepare('select vec_version() as v').get());
```

### Running the tests

`npm test` (unit) and `npm run test:integration`. `ALEXANDRIA_GIT_BIN` / `ALEXANDRIA_GIT_PREARGS`
override which git binary the sync path shells out to; the sync tests use them to point at a
scripted stand-in, because shadowing `PATH` with a shebang script does not work on Windows and
silently ran the real git instead.


## Collaborative Maintenance

Alexandria is designed to be collaboratively maintained by every Claude instance that has it installed. Each instance is both a consumer and contributor.

**Every Claude instance with Alexandria must:**
1. **Consult before setup** — Call `search_guides` or `read_guide` before setting up any tool
2. **Update after setup** — Call `update_guide` after completing setups or discovering fixes
3. **Document troubleshooting** — Add error/fix pairs to the Troubleshooting section of guides
4. **Use the template** — Call `get_guide_template` when creating new guides
5. **Recommend on project init** — Call `get_project_setup_recommendations` when setting up new projects
6. **Commit changes** — Commit guide updates to the git repo when practical

This contract is codified in `onboarding.json` and served by the `get_onboarding` tool.

## Project Voltron Integration

Alexandria is deeply integrated with **Project Voltron** (the companion agent-template MCP server). When both are installed:

- **Voltron's `scrum-master`** calls `get_project_setup_recommendations` when planning new projects, and syncs tool-specific findings to Alexandria at session end via `update_guide`
- **Specialist agents** (`fullstack-dev`, `devops-engineer`, `ui-designer`, `qa-tester`, `csharp-dev`, etc.) call `quick_setup` before installing any tool and `update_guide` after discovering platform-specific fixes
- **Alexandria's `recommendations.json`** always suggests scaffolding Voltron for new projects — the two systems bootstrap each other

This means tool knowledge flows in both directions: Voltron improves its agent instructions via reflections, and Alexandria accumulates concrete setup steps and workarounds discovered during those sessions.

**Setup:** Install both MCP servers globally. No extra configuration needed — Voltron's agent templates already include the relevant `mcp__alexandria__*` tools in their `tools:` frontmatter.

## Architecture

- Pure Node.js with `@modelcontextprotocol/sdk`
- Reads markdown files from the `../guides/` directory
- Supports CRUD operations on guides
- Search uses simple case-insensitive text matching with context

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Server not appearing in Claude | Restart Claude Code after adding to `.claude.json` |
| "No guides found" | Check that the guides directory exists and contains .md files |
| Path issues on Windows | Use forward slashes in the config path |

## References

- [MCP SDK](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [MCP Specification](https://modelcontextprotocol.io)

---

*Last updated: 2026-09-28*
*Setup verified on: Windows 10*
