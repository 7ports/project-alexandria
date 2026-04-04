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
