# Project Alexandria

A living knowledge base of tooling setup guides, optimized for AI-assisted development workflows.

## Purpose

This repository serves as a persistent reference for setting up development tools, MCP servers, and integrations that are commonly needed across projects. It is designed to be queried by Claude via a dedicated MCP server, making future tool setups faster and more reliable.

## Structure

```
project-alexandria/
├── guides/           # Setup guides for individual tools
├── templates/        # Templates for creating new guides
├── mcp-server/       # MCP server for AI access to this repo
└── README.md
```

## Guides

| Guide | Description |
|-------|-------------|
| [CoPlay MCP Server](guides/coplay-mcp-server.md) | Unity editor integration via MCP |
| [Git MCP Server](guides/git-mcp-server.md) | Git operations via MCP |
| [GitHub MCP Server](guides/github-mcp-server.md) | GitHub API access via MCP |
| [Memory MCP Server](guides/memory-mcp-server.md) | Persistent knowledge graph memory |
| [Fetch MCP Server](guides/fetch-mcp-server.md) | Web content fetching via MCP |
| [Firebase MCP Server](guides/firebase-mcp-server.md) | Firebase project management via MCP |
| [Claude in Chrome](guides/claude-in-chrome.md) | Browser automation via Chrome extension |
| [Beads](guides/beads.md) | Distributed graph issue tracker for AI agents |

## MCP Server

The `mcp-server/` directory contains a custom MCP server that exposes this repository's guides as searchable, queryable resources. See [MCP Server Setup](guides/alexandria-mcp-server.md) for installation.

## Contributing

When setting up new tooling, add a guide using the [template](templates/guide-template.md). Guides should capture:
- What the tool does
- Prerequisites
- Step-by-step installation
- Configuration (with platform-specific notes)
- Troubleshooting / common issues
- Integration with other tools
