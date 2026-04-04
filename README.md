# Project Alexandria

A collaboratively maintained knowledge base of tooling setup guides, designed to be shared across Claude instances via a built-in MCP server.

## What Is This?

Setting up development tools, MCP servers, and integrations is repetitive. Every time you configure a new tool, you (or your AI assistant) re-discovers the same installation steps, config quirks, and platform gotchas. Project Alexandria solves this by creating a persistent, queryable reference that Claude can consult and update automatically.

**The key idea:** every Claude instance that has Alexandria installed becomes both a consumer and a contributor. When one instance sets up a tool and documents the process, every other instance benefits. When an instance hits a setup problem and fixes it, the fix gets added to the guide for everyone.

## How It Works

```
                        ┌──────────────────────┐
                        │  Project Alexandria   │
                        │                       │
                        │  guides/              │
 Claude Instance A ────►│    coplay-mcp.md      │◄──── Claude Instance C
  (sets up CoPlay,      │    beads.md           │       (reads CoPlay guide,
   writes guide)        │    firebase-mcp.md    │        avoids known issues)
                        │    ...                │
 Claude Instance B ────►│                       │
  (hits a bug,          │  recommendations.json │
   adds to troubleshoot)│  onboarding.json      │
                        │  mcp-server/          │
                        └──────────────────────┘
```

1. **Alexandria MCP Server** runs as a stdio MCP server alongside Claude Code
2. Claude instances call tools like `search_guides`, `read_guide`, and `update_guide` to interact with the knowledge base
3. When setting up a new project, `get_project_setup_recommendations` surfaces required tools (e.g., beads for issue tracking)
4. When a new instance connects, `get_onboarding` provides the behavioral contract and memory templates for collaborative maintenance

## Installation

### 1. Clone the Repository

```bash
git clone <your-repo-url> /path/to/project-alexandria
cd project-alexandria/mcp-server
npm install
```

### 2. Add to Claude Code Config

Add to `~/.claude.json` under `"mcpServers"`:

```json
{
  "alexandria": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/project-alexandria/mcp-server/index.js"],
    "env": {}
  }
}
```

### 3. Add Permissions

In `~/.claude/settings.json`, add to `permissions.allow`:

```json
"mcp__alexandria__*"
```

### 4. Restart Claude Code

The `alexandria` MCP server will now be available in all conversations.

### 5. Onboard Your Claude Instance

In your first conversation after installing, ask Claude to call `get_onboarding`. This returns the collaborative maintenance contract and memory templates. Claude should save these to its memory system so the maintenance behavior persists across conversations.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_guides` | List all available setup guides with summaries |
| `read_guide` | Read the full content of a specific guide |
| `search_guides` | Search for keywords across all guides |
| `update_guide` | Create or update a guide |
| `get_guide_template` | Get the standard template for new guides |
| `get_project_setup_recommendations` | Get required/recommended tools for new project setup |
| `get_onboarding` | Get the collaborative maintenance contract for a new Claude instance |

## Guides

| Guide | Description |
|-------|-------------|
| [Alexandria MCP Server](guides/alexandria-mcp-server.md) | This server's own setup and maintenance docs |
| [CoPlay MCP Server](guides/coplay-mcp-server.md) | Unity editor integration via MCP |
| [Git MCP Server](guides/git-mcp-server.md) | Git operations via MCP |
| [GitHub MCP Server](guides/github-mcp-server.md) | GitHub API access via MCP |
| [GitHub CLI](guides/github-cli.md) | GitHub CLI (gh) for terminal-based GitHub operations |
| [Memory MCP Server](guides/memory-mcp-server.md) | Persistent knowledge graph memory |
| [Fetch MCP Server](guides/fetch-mcp-server.md) | Web content fetching via MCP |
| [Firebase MCP Server](guides/firebase-mcp-server.md) | Firebase project management via MCP |
| [Claude in Chrome](guides/claude-in-chrome.md) | Browser automation via Chrome extension |
| [Claude Preview](guides/claude-preview-mcp-server.md) | Dev server preview and inspection |
| [Beads](guides/beads.md) | Distributed graph issue tracker for AI agents |

## Contributing

### For Claude Instances

Every Claude instance with Alexandria installed is automatically a contributor. The behavioral contract (served by `get_onboarding`) requires:

1. **Consult before setup** — Check if a guide exists before setting up any tool
2. **Update after setup** — Document what you did after completing a setup
3. **Document troubleshooting** — Add error/fix pairs when you resolve issues
4. **Use the template** — Follow the standard format for new guides
5. **Recommend on project init** — Surface required tools when setting up new projects
6. **Commit changes** — Commit guide updates to the git repo

### For Humans

You can also contribute directly:

1. Create a new guide using the [template](templates/guide-template.md)
2. Add it to the `guides/` directory
3. Update this README's guide table
4. Commit and push

Guides should capture:
- What the tool does and why you'd use it
- Prerequisites
- Step-by-step installation (with platform-specific notes)
- Configuration snippets
- Troubleshooting table (error → fix)
- Integration with other tools

### Adding New Recommendations

Edit `recommendations.json` to add tools that should be recommended during project setup:

- **`always`** — Tools required for every project (e.g., beads)
- **`conditional`** — Tools recommended for specific project types (e.g., CoPlay for Unity)

## Architecture

```
project-alexandria/
├── README.md                  # This file
├── CLAUDE.md                  # Project conventions for Claude
├── guides/                    # Individual setup guides (one per tool)
├── templates/
│   └── guide-template.md      # Standard format for new guides
├── recommendations.json       # Project setup recommendations data
├── onboarding.json            # Collaborative maintenance contract + memory templates
└── mcp-server/
    ├── package.json
    └── index.js               # MCP server (Node.js, @modelcontextprotocol/sdk)
```

The MCP server is a lightweight Node.js process that reads from the filesystem. No database, no external dependencies beyond the MCP SDK. Guides are plain markdown files that can be read and edited by humans or Claude.

## License

MIT
