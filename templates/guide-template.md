# [Tool Name]

<!-- Write-back trigger reminder: you owe a guide (write_knowledge / update_guide) after ANY of these — (1) setting up/installing/configuring a tool, (2) resolving a non-obvious error, (3) discovering a version-compat fact or platform quirk, (4) getting a tricky config/command/API right, or (5) session close. Recording is the default, not an afterthought. Record ONLY general, project-agnostic knowledge; genericise host/path/secret/client/project specifics first (see the RECORD / DO NOT record examples below). -->

## Quick Reference

<!-- This section is extracted by quick_setup for fast, low-token lookups. -->
<!-- Keep it self-contained: just the commands and config needed to install. -->

**Install:**
```bash
# install command here
```

**Claude Code config** (`~/.claude.json` → `mcpServers`):
```json
{
  "tool-name": {
    "type": "stdio",
    "command": "...",
    "args": ["..."]
  }
}
```

**Verify:** `command --version`

## Overview

Brief description of what this tool does and why you'd use it.

## Prerequisites

- List of required software/accounts
- Minimum versions if applicable

## Installation

### Windows

```powershell
# Windows-specific install commands
```

### macOS

```bash
# macOS-specific install commands
```

### Linux

```bash
# Linux-specific install commands
```

## Configuration

### Claude Code Integration

How to add this tool to Claude Code's MCP configuration.

### Standalone Configuration

Any additional config files, environment variables, etc.

## Usage

Key commands or workflows for using the tool.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Common problem | How to fix it |

## Platform Notes

Any platform-specific quirks or differences.

## Related Tools

Links to related guides in this repo.

## References

- [Official Documentation](url)
- [GitHub Repository](url)

## What Belongs Here (content boundary)

Alexandria is strictly for **non-project-specific, reusable knowledge**. Before writing, apply the positive test: *"Would this exact text help an unrelated engineer on a completely different project who has never seen mine?"*

**✅ RECORD (general, reusable):**
- "better-sqlite3 must match the Node ABI; `npm rebuild better-sqlite3` after a Node major upgrade." *(version-compat fact)*
- "On Windows, MCP stdio paths need the leading slash stripped from `/C:/...`." *(platform quirk)*
- "Vite dev server needs `server.fs.allow` widened to serve files outside root." *(config pattern)*
- "gh CLI: `gh pr create --fill` fails without an upstream; run `git push -u` first." *(API/command gotcha)*

**❌ DO NOT record (project/host/secret-specific — keep in project CLAUDE.md):**
- "The `acme-billing` service talks to Postgres at `10.2.0.14`." *(host/IP + client name)*
- "Our deploy key lives at `/home/rajesh/.ssh/prod_deploy`." *(path + secret location)*
- "The `Invoice` model has a `taxJurisdiction` FK to `Region`." *(project data model)*
- "Set `STRIPE_KEY=sk_live_...` in the CI secrets." *(credential)*

**Genericise instead of skipping:** "our `acme-prod` build OOMs" → "Node builds OOM on large repos until you set `NODE_OPTIONS=--max-old-space-size=<MB>`."

---

*Last updated: YYYY-MM-DD*
*Setup verified on: [platform/version]*
