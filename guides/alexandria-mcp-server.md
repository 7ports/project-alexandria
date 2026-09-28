---
id: alexandria-mcp-server
type: guide
title: "Alexandria MCP Server"
summary: >
  A custom MCP server that exposes Project Alexandria's tooling setup guides as searchable, queryable resources.
tags: [mcp-server]
status: active
created: 2026-06-17
updated: 2026-06-17
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

### `update_guide` silently degrades a guide's frontmatter

`update_guide` takes raw markdown and writes frontmatter composed from the **name only**. Any
existing `title`, `summary` and `tags` are lost, and the title becomes the slug — so
`Coplay (now Aura) — Unity Plugin & MCP` came back as `coplay-unity-mcp` in every listing.

**Use `write_knowledge` with a `metadata` block for edits**, or restore the frontmatter by hand
afterwards. This has bitten real sessions; the damage is invisible until you next run `list_guides`.

## Semantic search requires native modules, and fails quietly

`search_knowledge` and `recall_context` degrade to a **lexical substring scan** when the vector
index cannot load. The degradation is announced only as a small `(mode: lexical-fallback)` marker,
and writes report `0 chunk(s) embedded (indexing not attempted — no store)`.

**The practical trap:** in lexical mode a natural-language question matches nothing, because it is a
substring scan. `"Unity humanoid animation root motion RootT.y sinking through floor"` returned no
results while the single keyword `"Mecanim"` returned two documents containing exactly that content.

> If a recall comes back empty, retry with **one or two keywords** before concluding nothing exists.
> Several sessions have wrongly concluded "no prior knowledge" and rewritten what was already there.

### Requirements

`better-sqlite3` + `sqlite-vec`, both with binaries matching the **host** platform and Node ABI.

Failure modes seen on Windows:

| Symptom | Cause | Fix |
|---|---|---|
| `Vector index unavailable — reindex skipped` | extension cannot load | see below |
| `sqlite-vec-windows-x64 NOT INSTALLED`, only `sqlite-vec-linux-x64` present | `node_modules` populated in a Linux/Docker context | `npm install sqlite-vec-windows-x64` |
| `better_sqlite3.node is not a valid Win32 application` | same — the compiled binding is a Linux build | rebuild or reinstall on the host |
| `npm rebuild better-sqlite3` fails in node-gyp | `better-sqlite3@9` has no prebuild for recent Node (e.g. Node 24), so it must compile, which needs VS Build Tools | bump to a version with prebuilds for your Node, install the build tools, or run an older Node |

Note `require('better-sqlite3')` succeeds even when broken — the native binding is not loaded until a
`Database` is instantiated. Test properly:

```js
const v = require('sqlite-vec'), Database = require('better-sqlite3');
const db = new Database(':memory:'); v.load(db);
console.log(db.prepare('select vec_version() as v').get());
```

If the repo is also built inside Docker, a single shared `node_modules` cannot serve both platforms.
Keep the container's install separate from the host's.

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

*Last updated: 2026-04-04*
*Setup verified on: Windows 10*
