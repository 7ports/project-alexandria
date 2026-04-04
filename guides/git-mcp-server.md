# Git MCP Server

## Quick Reference

**Install:** Requires `uvx` (`pip install uv`).

**Claude Code config** (`~/.claude.json` → `mcpServers`):
```json
{
  "git": {
    "type": "stdio",
    "command": "uvx",
    "args": ["mcp-server-git"]
  }
}
```

**Verify:** Auto-detects git repos from working directory. No further config needed.

## Overview

Provides Git repository operations via MCP. Allows AI assistants to perform git status, diff, log, commit, branch management, and other git operations through structured tool calls rather than shell commands.

## Prerequisites

- Git installed and available on PATH
- Python with `uvx` available (install via `pip install uv`)

## Installation

Add to your `~/.claude.json` under `"mcpServers"`:

```json
{
  "git": {
    "type": "stdio",
    "command": "uvx",
    "args": ["mcp-server-git"]
  }
}
```

No additional configuration needed — it auto-detects git repositories from the working directory.

## Available Tools

| Tool | Description |
|------|-------------|
| `git_status` | Show working tree status |
| `git_diff` | Show differences between branches/commits |
| `git_diff_staged` | Show staged changes |
| `git_diff_unstaged` | Show unstaged changes |
| `git_log` | View commit history (with optional date filtering) |
| `git_show` | Show contents of a specific commit |
| `git_add` | Stage files |
| `git_commit` | Create commits |
| `git_create_branch` | Create new branches |
| `git_checkout` | Switch branches |
| `git_branch` | List branches (local/remote/all) |
| `git_reset` | Unstage all staged changes |

## Usage Notes

- All tools require a `repo_path` parameter pointing to the git repository
- `git_log` supports timestamp filtering with ISO 8601, relative dates ("2 weeks ago"), or absolute dates
- `git_branch` can filter by commit containment with `contains`/`not_contains` params
- `git_diff` requires a `target` (branch name or commit SHA)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not a git repository" | Ensure `repo_path` points to a directory with a `.git` folder |
| `uvx` not found | Install uv: `pip install uv` or `pipx install uv` |
| Permission errors on Windows | Run terminal as administrator, or check file permissions |

## References

- [mcp-server-git on PyPI](https://pypi.org/project/mcp-server-git/)
- [MCP Specification](https://modelcontextprotocol.io)

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10*
