# Memory MCP Server

## Quick Reference

**Install:** Requires Node.js 18+.

**Claude Code config** (`~/.claude.json` → `mcpServers`):
```json
{
  "memory": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  }
}
```

**Storage:** `~/.mcp-memory/memory.json` (persists across sessions).

## Overview

Provides a persistent knowledge graph for AI assistants via MCP. Stores entities, observations, and relations that persist across conversations. Useful for maintaining context about users, projects, and decisions over time.

## Prerequisites

- Node.js (v18+)
- npm/npx available on PATH

## Installation

Add to your `~/.claude.json` under `"mcpServers"`:

```json
{
  "memory": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  }
}
```

No additional configuration needed. Data is stored in a local JSON file.

## Available Tools

| Tool | Description |
|------|-------------|
| `create_entities` | Create entities with name, type, and observations |
| `add_observations` | Add observations to existing entities |
| `create_relations` | Link entities with typed relations |
| `search_nodes` | Search entities by name, type, or observation content |
| `open_nodes` | Retrieve specific entities by name |
| `read_graph` | Read the entire knowledge graph |
| `delete_entities` | Remove entities and their relations |
| `delete_observations` | Remove specific observations |
| `delete_relations` | Remove specific relations |

## Data Model

The knowledge graph consists of:
- **Entities**: Named nodes with a type and list of observations (strings)
- **Relations**: Directed edges between entities with a relation type (active voice)

Example:
```
Entity: "Project Pepper" (type: "project")
  - observations: ["Unity 6 game project", "Uses CoPlay MCP"]

Entity: "Raj" (type: "user")
  - observations: ["Primary developer"]

Relation: Raj --works_on--> Project Pepper
```

## Storage

Data is stored in `~/.mcp-memory/memory.json` by default. This file persists across sessions and can be backed up.

## Usage Tips

- Use meaningful entity names (they're the primary lookup key)
- Keep observations atomic — one fact per observation
- Use active voice for relations ("works_on", "depends_on", "created")
- Search is broad — matches against names, types, and observation text
- `read_graph` returns everything; use `search_nodes` for targeted queries

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Empty graph on new session | Memory persists in the JSON file — check if the file exists |
| `npx` hangs or fails | Clear npx cache: `npx clear-npx-cache` |
| Duplicate entities | Search before creating; entities are keyed by name |

## References

- [@modelcontextprotocol/server-memory on npm](https://www.npmjs.com/package/@modelcontextprotocol/server-memory)
- [MCP Specification](https://modelcontextprotocol.io)

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10*
