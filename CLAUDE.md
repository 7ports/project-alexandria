# Project Alexandria

This is a living tooling documentation repository. It contains setup guides for tools, MCP servers, and integrations used across projects.

## Key Rules

- **Always update guides** when setting up new tooling or discovering fixes
- **Use the guide template** in `templates/guide-template.md` for new guides
- **Keep guides practical** — focus on step-by-step instructions, config snippets, and troubleshooting
- **Include platform notes** — this setup runs primarily on Windows 10

## Structure

- `guides/` — Individual setup guides (one per tool)
- `templates/` — Templates for creating new guides
- `mcp-server/` — The MCP server that exposes these guides to Claude

## MCP Server

The `mcp-server/` is a Node.js MCP server configured globally in `~/.claude.json` as `"alexandria"`. It provides:
- `list_guides` — List available guides
- `read_guide` — Read a specific guide
- `search_guides` — Search across all guides
- `update_guide` — Create/update guides
- `get_guide_template` — Get the new guide template
