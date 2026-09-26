---
id: coplay-unity-mcp
type: guide
title: coplay-unity-mcp
embedding_version: 1
---

# Coplay (now Aura) — Unity Plugin & MCP

> ⚠️ **Two repos exist — don't confuse them.** This project uses the **Coplay plugin** (`coplay-unity-plugin`), whose MCP server registers as **`coplay-mcp`** and provides the generative tools (`generate_3d_model_*`, `generate_music`, `generate_sfx`, `generate_tts`, `auto_rig_3d_model`) plus scene/asset/Play-Mode control. The separate `CoplayDev/unity-mcp` ("MCP for Unity", `com.coplaydev.unity-mcp`) is a leaner open-source bridge and is **NOT** what serves the `mcp__coplay-mcp__*` tools. Verified 2026-07-04.

## Quick Reference

<!-- This section is extracted by quick_setup for fast, low-token lookups. -->
<!-- Keep it self-contained: just the commands and config needed to install. -->

**Package identity** (verified 2026-09-26 from `package.json` on the `beta` branch):

| Field | Value |
|-------|-------|
| name | `com.coplaydev.coplay` |
| displayName | Coplay |
| version | 8.20.8 |
| min Unity | 2022.3 |
| dependencies | `com.unity.inputsystem` 1.1.1, `com.unity.cloud.gltfast` 6.12.1 (UPM pulls both from the registry) |

**Install via the Editor (git UPM):**
Window → Package Manager → `+` → **Add package from git URL**:
```
https://github.com/CoplayDev/coplay-unity-plugin.git#beta
```

**Install without the Editor UI** — add the git dependency straight to `Packages/manifest.json`; Unity
resolves it on next focus:
```json
"com.coplaydev.coplay": "https://github.com/CoplayDev/coplay-unity-plugin.git#beta"
```
Useful when you cannot drive the Editor — including the chicken-and-egg case where the bridge is not
installed yet, so the MCP tools that would install it are exactly the ones that do not work. Requires
git on PATH for Unity.

**Open it:** menu **Coplay → Toggle Window**, or `Ctrl+G` / `Cmd+G`.

**Verify:** the Coplay panel opens and shows "connected"; in an MCP client the server appears as `coplay-mcp` with tools like `create_game_object`, `play_game`, `generate_sfx`.

**Note:** Coplay was acquired and is rebranding to **Aura** (https://www.tryaura.dev/). The `#beta` git URL still works; new installs may be directed to Aura.

## Overview

Coplay (→ Aura) is an in-Editor AI assistant plugin for Unity. It exposes an MCP server (`coplay-mcp`) that lets external AI clients drive the Unity Editor: manage GameObjects/prefabs/scenes, edit components, run Play Mode, read console/logs, take screenshots, and use generative asset tools (3D models from text/image, music, SFX, TTS, auto-rigging). In a Project Voltron Unity setup, this is what powers the host-only Editor agents (`scene-architect`, `build-validator`, and the Editor-preview slices of `shader-artist` / `asset-manager`) — those agents require a live Editor with this plugin connected and cannot run in Docker.

## Prerequisites

- Unity Editor (open project) — the MCP tools fail if the Editor process is not running, even when the project root is registered.
- The plugin installed **in that specific project** — see the gotcha below; a running Editor is necessary but not sufficient.
- An MCP client to drive it (Claude Code, Cursor, VS Code, etc.).
- A Coplay/Aura account may be required for the generative (cloud) features.

## Installation

The plugin normally installs **inside the Unity Editor** via Package Manager.

### Windows / macOS / Linux (same flow)

1. Window → Package Manager
2. `+` (top-left) → **Add package from git URL…**
3. Paste: `https://github.com/CoplayDev/coplay-unity-plugin.git#beta`
4. Open with **Coplay → Toggle Window** or `Ctrl+G` / `Cmd+G`.

To pin a version, replace `#beta` with a specific tag/branch if the repo publishes one.

### Editing manifest.json directly

Equivalent and scriptable — the entry above under Quick Reference. Read the package name from the repo
rather than guessing it:

```bash
curl -sfL https://raw.githubusercontent.com/CoplayDev/coplay-unity-plugin/beta/package.json
```

(The `main` branch has no `package.json` at the root; use `beta`.) Adding a *git* dependency to the
manifest is fine — UPM resolves the package's own registry dependencies automatically.

## Configuration

### Claude Code / MCP client integration

The plugin hosts the `coplay-mcp` server; connect your MCP client to it per Coplay/Aura's in-panel setup. Once connected, tools appear under the `coplay-mcp` server name in the client.

### Editor must be running AND the plugin must be present

Two distinct failure modes produce the **same** error message,
`Unity Editor is not running at the specified project root`:

1. The Editor process is closed.
2. The Editor is open but **this project has never had the plugin installed**, so there is no bridge to
   talk to.

`list_unity_project_roots` does not distinguish them — it is satisfied by on-disk project metadata and
will happily return a project whose Editor cannot be reached. `set_unity_project_root` also succeeds
while changing nothing, which makes it easy to misdiagnose as a path problem.

Tell them apart before doing anything else:

```powershell
Get-Process -Name Unity | Select-Object Id, MainWindowTitle   # title shows project + scene + version
```
```bash
grep -ril "coplay" Packages/ Assets/          # plugin present in the project?
ls Library/PackageCache | grep -iE "coplay|aura"
```

If the process is alive and the greps find nothing, it is case 2: install the plugin (ask first — it is
a project dependency change) or fall back to file-based work. See
[[coplay-mcp-unity-editor-gotchas]] for the full file-based playbook.

## Usage

- Keep the Unity Editor **open and focused** while the MCP client runs.
- Tools cover: scene hierarchy/GameObjects, prefabs, components, transforms, UI, materials, Play Mode control, console/log reads, screenshots, and generative assets (3D/music/SFX/TTS/rigging).
- In Voltron: dispatch Editor-required agents (`scene-architect`, `build-validator`) from the **host** via the `Agent` tool, never Docker.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Unity Editor is not running at the specified project root" | Two causes — Editor closed, or plugin absent from this project. Check the process AND grep for the plugin (above) before assuming which |
| Wrong repo installed (`unity-mcp`) and tools missing | Uninstall it; install `coplay-unity-plugin.git#beta` — only that repo serves the `coplay-mcp` generative toolset |
| Git URL add fails | Confirm the full URL incl. `#beta`; check Unity has network/git access and git on PATH |
| Panel won't open | Use menu Coplay → Toggle Window, or the `Ctrl+G` / `Cmd+G` shortcut |
| Generative tools error / need login | Sign in to Coplay/Aura; some features are cloud-backed and require an account |

## Platform Notes

- Install flow is identical across Windows/macOS/Linux (all via Package Manager or manifest.json).
- The `mcp__coplay-mcp__*` tool prefix in an MCP client confirms this plugin (not `unity-mcp`) is the connected server.

## Related Tools

- [[coplay-mcp-unity-editor-gotchas]] — per-tool gotchas and the file-based fallback playbook
- [[beads]] — Voltron task tracking (mandatory dependency)
- `CoplayDev/unity-mcp` ("MCP for Unity", `com.coplaydev.unity-mcp`) — a *different*, leaner open-source MCP bridge; document separately if ever used. Not interchangeable with this plugin.

## References

- [CoplayDev/coplay-unity-plugin (this project's plugin)](https://github.com/CoplayDev/coplay-unity-plugin)
- [Aura (Coplay's successor)](https://www.tryaura.dev/)
- [CoplayDev/unity-mcp — separate "MCP for Unity" bridge](https://github.com/CoplayDev/unity-mcp)
- [Coplay docs — Claude Code guide](https://docs.coplay.dev/coplay-mcp/claude-code-guide)

---

*Last updated: 2026-09-26*
*2026-09-26: added verified package identity (`com.coplaydev.coplay` 8.20.8), the manifest.json install route, and the "plugin absent vs Editor closed" diagnosis — both produce the same error string.*
*2026-07-04: corrected — originally documented CoplayDev/unity-mcp; the project's `coplay-mcp` server is served by CoplayDev/coplay-unity-plugin (identified by its generative toolset).*
