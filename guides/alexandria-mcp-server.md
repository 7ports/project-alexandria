# Alexandria MCP Server

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

## Available Tools

| Tool | Description |
|------|-------------|
| `list_guides` | List all available tooling setup guides with summaries |
| `read_guide` | Read the full content of a specific guide by name |
| `search_guides` | Search for keywords across all guides |
| `update_guide` | Update an existing guide or create a new one |
| `get_guide_template` | Get the template for creating new guides |

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

## Maintenance

This server is designed to be continually updated. When setting up new tooling:

1. Use `get_guide_template` to get the standard format
2. Fill in the guide with setup steps, config, and troubleshooting
3. Use `update_guide` to save it
4. Commit changes to the project-alexandria git repo

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
