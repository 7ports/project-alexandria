# Coplay (now Aura) — Unity Plugin & MCP

> ⚠️ **Two repos exist — don't confuse them.** This project uses the **Coplay plugin** (`coplay-unity-plugin`), whose MCP server registers as **`coplay-mcp`** and provides the generative tools (`generate_3d_model_*`, `generate_music`, `generate_sfx`, `generate_tts`, `auto_rig_3d_model`) plus scene/asset/Play-Mode control. The separate `CoplayDev/unity-mcp` ("MCP for Unity", `com.coplaydev.unity-mcp`) is a leaner open-source bridge and is **NOT** what serves the `mcp__coplay-mcp__*` tools. Verified 2026-07-04.

## Quick Reference

<!-- This section is extracted by quick_setup for fast, low-token lookups. -->
<!-- Keep it self-contained: just the commands and config needed to install. -->

**Install the Coplay plugin (Unity Editor — git UPM):**
Window → Package Manager → `+` → **Add package from git URL**:
```
https://github.com/CoplayDev/coplay-unity-plugin.git#beta
```

**Open it:** menu **Coplay → Toggle Window**, or `Ctrl+G` / `Cmd+G`.

**Verify:** the Coplay panel opens and shows "connected"; in an MCP client the server appears as `coplay-mcp` with tools like `create_game_object`, `play_game`, `generate_sfx`.

**Note:** Coplay was acquired and is rebranding to **Aura** (https://www.tryaura.dev/). The `#beta` git URL still works; new installs may be directed to Aura.

## Overview

Coplay (→ Aura) is an in-Editor AI assistant plugin for Unity. It exposes an MCP server (`coplay-mcp`) that lets external AI clients drive the Unity Editor: manage GameObjects/prefabs/scenes, edit components, run Play Mode, read console/logs, take screenshots, and use generative asset tools (3D models from text/image, music, SFX, TTS, auto-rigging). In a Project Voltron Unity setup, this is what powers the host-only Editor agents (`scene-architect`, `build-validator`, and the Editor-preview slices of `shader-artist` / `asset-manager`) — those agents require a live Editor with this plugin connected and cannot run in Docker.

## Prerequisites

- Unity Editor (open project) — the MCP tools fail if the Editor process is not running, even when the project root is registered.
- An MCP client to drive it (Claude Code, Cursor, VS Code, etc.).
- A Coplay/Aura account may be required for the generative (cloud) features.

## Installation

The plugin installs **inside the Unity Editor** via Package Manager.

### Windows / macOS / Linux (same flow)

1. Window → Package Manager
2. `+` (top-left) → **Add package from git URL…**
3. Paste: `https://github.com/CoplayDev/coplay-unity-plugin.git#beta`
4. Open with **Coplay → Toggle Window** or `Ctrl+G` / `Cmd+G`.

To pin a version, replace `#beta` with a specific tag/branch if the repo publishes one.

## Configuration

### Claude Code / MCP client integration

The plugin hosts the `coplay-mcp` server; connect your MCP client to it per Coplay/Aura's in-panel setup. Once connected, tools appear under the `coplay-mcp` server name in the client.

### Editor must be running

The single most common failure: the project root is registered but the **Editor process is closed**, so every `mcp__coplay-mcp__*` call returns "Unity Editor is not running at the specified project root." Keep the Editor open and the Coplay panel connected during any Editor-side agent run.

## Usage

- Keep the Unity Editor **open and focused** while the MCP client runs.
- Tools cover: scene hierarchy/GameObjects, prefabs, components, transforms, UI, materials, Play Mode control, console/log reads, screenshots, and generative assets (3D/music/SFX/TTS/rigging).
- In Voltron: dispatch Editor-required agents (`scene-architect`, `build-validator`) from the **host** via the `Agent` tool, never Docker.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unity Editor is not running at the specified project root" | Open the Editor on the project; wait for import/compile to finish; confirm the Coplay panel shows "connected" |
| Wrong repo installed (`unity-mcp`) and tools missing | Uninstall it; install `coplay-unity-plugin.git#beta` — only that repo serves the `coplay-mcp` generative toolset |
| Git URL add fails | Confirm the full URL incl. `#beta`; check Unity has network/git access |
| Panel won't open | Use menu Coplay → Toggle Window, or the `Ctrl+G` / `Cmd+G` shortcut |
| Generative tools error / need login | Sign in to Coplay/Aura; some features are cloud-backed and require an account |

## Platform Notes

- Install flow is identical across Windows/macOS/Linux (all via Package Manager).
- The `mcp__coplay-mcp__*` tool prefix in an MCP client confirms this plugin (not `unity-mcp`) is the connected server.

## Related Tools

- [[beads]] — Voltron task tracking (mandatory dependency)
- `CoplayDev/unity-mcp` ("MCP for Unity", `com.coplaydev.unity-mcp`) — a *different*, leaner open-source MCP bridge; document separately if ever used. Not interchangeable with this plugin.

## References

- [CoplayDev/coplay-unity-plugin (this project's plugin)](https://github.com/CoplayDev/coplay-unity-plugin)
- [Aura (Coplay's successor)](https://www.tryaura.dev/)
- [CoplayDev/unity-mcp — separate "MCP for Unity" bridge](https://github.com/CoplayDev/unity-mcp)
- [Coplay docs — Claude Code guide](https://docs.coplay.dev/coplay-mcp/claude-code-guide)

---

*Last updated: 2026-07-04*
*Corrected: originally documented CoplayDev/unity-mcp; the project's `coplay-mcp` server is served by CoplayDev/coplay-unity-plugin (identified by its generative toolset). Verified via repo fetch on Windows 10 session; not yet hands-on-verified in-Editor.*
