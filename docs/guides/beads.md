---
id: beads
type: guide
title: "Beads — Distributed Graph Issue Tracker for AI Agents"
summary: >
  Beads (`bd` CLI) is a distributed graph issue tracker designed for AI coding agents, powered by Dolt (a version-controlled SQL database).
tags: [dev-tooling]
status: active
created: 2026-06-17
updated: 2026-07-15
embedding_version: 1
---

# Beads — Distributed Graph Issue Tracker for AI Agents

## Quick Reference

**Install (Windows):**
```powershell
npm install -g @beads/bd
```

**Project init:**
```bash
bd init --quiet
bd setup claude
```

**Verify:** `bd version`

**Key commands:** `bd ready` (list actionable tasks), `bd create "Title" -p 0` (new task), `bd update <id> --claim` (claim), `bd close <id> "reason"` (done).

## Overview

Beads (`bd` CLI) is a distributed graph issue tracker designed for AI coding agents, powered by Dolt (a version-controlled SQL database). It provides persistent, structured memory for coding agents with dependency-aware task graphs, replacing unstructured markdown plans.

> **Policy: Beads should always be used for any complex coding project.** If a project involves multiple tasks, features, bugs, or any non-trivial scope, initialize beads to track issues and dependencies. This ensures structured, persistent task management that survives across sessions and prevents work from being lost or duplicated.

**Key features:**
- Dependency-aware task graph with blockers and parent-child relationships
- Dolt-powered version-controlled SQL database storage
- Agent-optimized with JSON output and `bd prime` context injection
- Hash-based IDs (e.g., `bd-a1b2`) prevent merge collisions in multi-agent workflows
- Semantic "memory decay" compaction for old closed tasks
- Message threading and mail delegation
- Works with or without git

## Prerequisites

- One of: npm, Homebrew, Go, or a C compiler (for building from source)
- For Windows: npm is the easiest path
- Optional: `uv` (for the MCP server component)

## Installation

### Windows (Recommended: npm)

```powershell
npm install -g @beads/bd
```

### Windows (PowerShell installer)

```powershell
irm https://raw.githubusercontent.com/steveyegge/beads/main/install.ps1 | iex
```

### macOS (Homebrew)

```bash
brew install beads
```

### Any Platform (npm)

```bash
npm install -g @beads/bd
```

### Any Platform (Go)

```bash
go install github.com/steveyegge/beads/cmd/bd@latest
```

### Build from Source

Requires a C compiler (CGO).

**macOS:**
```bash
xcode-select --install && brew install icu4c
```

**Ubuntu/Debian:**
```bash
sudo apt install build-essential
```

**Windows (MinGW/MSYS2):**
```bash
# ICU not required on Windows — pure-Go fallback is used
go build -tags gms_pure_go -o bd.exe ./cmd/bd
```

Then:
```bash
git clone https://github.com/steveyegge/beads
cd beads
make install
```

### Verify Installation

```bash
bd version
bd help
```

## Project Initialization

```bash
cd your-project
bd init
```

This creates a `.beads/` directory with the issue database. **Important:** beads is installed system-wide — do NOT clone the beads repo into your project.

### Initialization Modes

| Mode | Command | Description |
|------|---------|-------------|
| Default | `bd init` | Standard setup with git integration |
| Stealth | `bd init --stealth` | No git integration, no committed files |
| Contributor | `bd init --contributor` | For forked repos, keeps planning separate |
| Quiet | `bd init --quiet` | Suppress output |

## Claude Code Integration

### Recommended: CLI + Hooks

```bash
bd setup claude
```

This installs **SessionStart** and **PreCompact** hooks. On session start, `bd prime` is automatically injected (~1-2k tokens of workflow context).

Verify with:
```bash
bd setup claude --check
```

### Optional: Claude Code Plugin (Enhanced UX)

```bash
/plugin marketplace add steveyegge/beads
/plugin install beads
# Restart Claude Code
```

Adds slash commands: `/beads:ready`, `/beads:create`, `/beads:show`, `/beads:update`, `/beads:close`, plus a task agent.

### MCP Server (for MCP-only environments)

```bash
uv tool install beads-mcp
```

For Claude Desktop, add to config:
```json
{
  "mcpServers": {
    "beads": {
      "command": "beads-mcp"
    }
  }
}
```

For VS Code, create `.vscode/mcp.json`:
```json
{
  "servers": {
    "beads": {
      "command": "beads-mcp"
    }
  }
}
```

## Configuration

### Storage Modes

**Embedded (default):** Dolt runs in-process. Data in `.beads/embeddeddolt/`. Single-writer.

**Server mode:** External `dolt sql-server` for concurrent writers.

| Flag | Env Var | Default |
|------|---------|---------|
| `--server-host` | `BEADS_DOLT_SERVER_HOST` | `127.0.0.1` |
| `--server-port` | `BEADS_DOLT_SERVER_PORT` | `3307` |
| `--server-user` | `BEADS_DOLT_SERVER_USER` | `root` |
| | `BEADS_DOLT_PASSWORD` | (none) |

### Git-Free Usage

```bash
export BEADS_DIR=/path/to/your/project/.beads
bd init --quiet --stealth
```

## Essential Commands

| Command | Description |
|---------|-------------|
| `bd ready` | List tasks with no open blockers |
| `bd create "Title" -p 0` | Create a P0 task |
| `bd update <id> --claim` | Atomically claim a task |
| `bd dep add <child> <parent>` | Link task dependencies |
| `bd show <id>` | View task details and audit trail |
| `bd prime` | Output workflow context for agent injection |
| `bd close <id> "reason"` | Close a completed task |
| `bd backup init /path` | Initialize backup location |
| `bd backup sync` | Sync to backup |
| `bd backup restore --force /path` | Restore from backup |

## Other Editor Integrations

| Editor | Setup Command |
|--------|--------------|
| Cursor IDE | `bd setup cursor` |
| Aider | `bd setup aider` |
| Codex CLI | `bd setup codex` |
| Mux | `bd setup mux` |

## Component Summary

| Component | What | When Needed |
|-----------|------|-------------|
| `bd` CLI | Core command-line tool | Always |
| Claude Code Plugin | Slash commands + UX | Optional |
| `beads-mcp` | MCP server interface | MCP-only environments |

All three can coexist without conflicts.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `bd` not found after install | Restart terminal; ensure install location is on PATH |
| CGO errors building from source | Install a C compiler (gcc/clang/MinGW) |
| Database locked | Only one writer at a time in embedded mode; use server mode for concurrency |
| Git conflicts in `.beads/` | Hash-based IDs should prevent this; try `bd repair` |

## Reliability: shared dolt-server vs per-project embedded (Windows)

If you run bd in **server mode** with a single shared `dolt sql-server` across multiple projects (`dolt.shared-server: true`, one port serving all repos), expect instability on Windows. Hard-won lessons:

- **The process is unsupervised.** A user-launched `dolt sql-server` has no Windows service or scheduled task behind it, so it is orphaned on reboot/logout AND can die mid-session. In shared-server mode bd refuses to auto-spawn it (auto-start is suppressed by design), so every affected session hard-stops until someone runs `bd dolt start`.
- **Loopback connection aborts under multi-project churn.** With several projects each opening a short-lived connection per bd command against one `127.0.0.1:<port>`, the server log fills with Windows `wsasend: An established connection was aborted by the software in your host machine` handshake failures. This is a *connection* failure, not a process crash — so supervising/restarting the process does NOT fix it.
- **A diverged, backup-less dolt remote floods the log.** `unknown push error; no common ancestor` / `nothing to commit` warnings on every write are benign under `shared-server: true` + `backup.git-push: false`, but they bury the real connection-abort errors in the log.

**Durable fix that removes the whole failure class — per-project *embedded* Dolt.** Set `dolt.shared-server: false` so each project runs Dolt in-process (data in `.beads/embeddeddolt/`) — no long-running server, no TCP port — so both the process-death and the `wsasend`-abort classes disappear by construction, and projects are fully isolated. Trade-off: embedded is single-writer per project (fine when a single host orchestrator writes and CI/containers do not). Migrate existing shared-server DBs via Dolt export/import; verify row counts; keep the old shared-server data dir read-only until confirmed.

**Make bd non-blocking regardless of storage choice.** Never let a bd/DB outage hard-fail an entire session: after one automated recovery attempt, degrade to a lightweight fallback tracker and continue. And gate readiness on `bd ready --json` **exit 0**, NOT on grepping `bd dolt status` text — the status text can print "running" while the server is actually down (false-positive liveness).

**Reliable recovery when a shared server won't come up:** `rm -f .beads/dolt-server.pid .beads/dolt-server.lock && bd dolt start` — stale pid/lock removal is effectively first-line on Windows, not a rare fallback. On Windows without WSL, run the installer's binary release or `npm install -g @beads/bd`. Keep `bd`/`dolt` current — running many releases behind on the storage engine means upstream loopback/handshake fixes are absent — but do NOT assume a version bump alone resolves the `wsasend` aborts.

**Permanent shared-server keep-alive (only if you stay on server mode):** register `bd dolt start` (or `dolt sql-server`) as a Windows Scheduled Task at logon, or as a service via NSSM with restart-on-failure. This closes the orphaning gap but does NOT stop the connection-abort class — which is why per-project embedded is the stronger fix.

## References

- [GitHub Repository](https://github.com/steveyegge/beads)
- [Beads Documentation](https://github.com/steveyegge/beads#readme)

---

*Last updated: 2026-07-15*
*Status: active — in use*
