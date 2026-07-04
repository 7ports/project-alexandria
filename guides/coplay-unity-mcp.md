# Coplay — MCP for Unity

## Quick Reference

<!-- This section is extracted by quick_setup for fast, low-token lookups. -->
<!-- Keep it self-contained: just the commands and config needed to install. -->

**Install (Unity Editor — git UPM):**
Window → Package Manager → `+` → **Add package from git URL**:
```
https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main
```

**Alternative (OpenUPM):**
```bash
openupm add com.coplaydev.unity-mcp
```

**Configure:** Window → **MCP for Unity** → setup wizard auto-runs (checks Python + `uv`, then configures detected MCP clients).

**Verify:** Window → MCP for Unity shows dependencies green + at least one MCP client "Configured".

## Overview

MCP for Unity (by CoplayDev) bridges AI assistants (Claude Code, Cursor, Copilot, etc.) and the Unity Editor. It exposes tools to manage assets, control scenes, edit scripts, run Play Mode, and automate Editor tasks over MCP. In a Project Voltron Unity setup, this is what powers the Editor-side agents (`scene-architect`, `build-validator`, and the Editor-preview slices of `shader-artist` / `asset-manager`) — those agents cannot run in Docker and require a live Editor with this package connected.

## Prerequisites

- Unity **2021.3 LTS → 6.x**
- **Python 3.10+** (installed/managed via `uv` — the wizard can install both if missing)
- An MCP client to drive it (Claude Code, Cursor, VS Code Copilot, etc.)

## Installation

The package installs **inside the Unity Editor**, not via a shell package manager. The commands below are the entry points; the actual add happens in Package Manager.

### Windows / macOS / Linux (same flow)

Option A — **Git URL** (recommended, always latest `main`):
1. Window → Package Manager
2. `+` (top-left) → **Add package from git URL…**
3. Paste: `https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main`

Option B — **OpenUPM CLI** (from the project root):
```bash
openupm add com.coplaydev.unity-mcp
```

Option C — **Asset Store**: import "MCP for Unity", then Window → Package Manager → **My Assets** → Import.

## Configuration

### Claude Code Integration

Unlike a standalone stdio MCP server, you do **not** hand-edit `~/.claude.json` for this one — the in-Editor wizard writes the client config for you:

1. After import, **Window → MCP for Unity** opens the setup wizard automatically.
2. Confirm **Python** and **uv** are green (wizard guides installation if missing). Click **Done**.
3. The wizard lists MCP clients detected on your machine. Select the client(s) (e.g. Claude Code) and click **Configure Selected**.

If you prefer manual config or the wizard doesn't detect your client, see the official Claude Code guide (link below) for the exact `mcpServers` entry to add.

### Standalone Configuration

The Editor package launches a Python MCP server via `uv`. Keep `uv` on PATH; the server process is spawned by the Editor bridge, so no separate daemon setup is required.

## Usage

- Keep the Unity Editor **open** while the MCP client is running — Editor-side tools fail if the Editor is closed.
- Tools cover: asset management, scene hierarchy/GameObjects, script editing, Play Mode control, console/log reads, screenshots.
- In Voltron: dispatch Editor-required agents from the **host** (`Agent` tool), never Docker.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Wizard can't find Python | Install Python 3.10+; ensure `uv` is installed and on PATH, then reopen Window → MCP for Unity |
| Client not detected in wizard | Configure manually per the official Claude Code guide, or restart the client so the wizard re-detects it |
| Git URL add fails | Confirm the full URL including `?path=/MCPForUnity#main`; check Unity has network/git access |
| Tools time out / no response | Ensure the Editor is open and focused; check the Editor console for the MCP bridge status |
| Version pin needed | Replace `#main` with a tag/branch, or use OpenUPM to pin a specific version |

## Platform Notes

- The install flow is identical across Windows/macOS/Linux — everything happens through the Unity Package Manager UI.
- Python/`uv` are the only host-level dependencies; on Windows the wizard's `uv` bootstrap is the smoothest path (avoids PATH issues with a system Python).

## Related Tools

- [[beads]] — Voltron task tracking (mandatory dependency)
- Project Voltron Unity agent team (`scene-architect`, `build-validator`) depend on this package being connected.

## References

- [Install — MCP for Unity](https://coplaydev.github.io/unity-mcp/getting-started/install)
- [GitHub — CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp)
- [Setting Up Coplay MCP with Claude Code](https://docs.coplay.dev/coplay-mcp/claude-code-guide)
- [OpenUPM — com.coplaydev.unity-mcp](https://openupm.com/packages/com.coplaydev.unity-mcp/)
- [Common Setup Problems (Wiki)](https://github.com/CoplayDev/unity-mcp/wiki/3.-Common-Setup-Problems)

---

*Last updated: 2026-07-04*
*Setup verified on: documented from official CoplayDev sources (Windows 10 session); not yet hands-on-verified in-Editor this session*
