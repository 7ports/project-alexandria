# CoPlay MCP Server (Unity Integration)

## Quick Reference

**Install:** Requires `uvx` (`pip install uv`) and CoPlay Unity plugin in your project.

**Claude Code config** (`~/.claude.json` → `mcpServers`):
```json
{
  "coplay-mcp": {
    "type": "stdio",
    "command": "uvx",
    "args": ["--no-cache", "--python", "3.12", "coplay-mcp-server@latest"],
    "env": { "MCP_TOOL_TIMEOUT": "720000" }
  }
}
```

> ⚠️ **Windows users:** the `--no-cache` flag and pinned `--python 3.12` together avoid a known Windows file-lock issue with the uv cache. See **Windows Gotchas** below for the long story. On macOS/Linux you can drop `--no-cache` and use `--python ">=3.11"`.

**First use:** Call `set_unity_project_root` with the absolute path to your Unity project.

## Overview

CoPlay MCP Server provides deep Unity Editor integration via the Model Context Protocol. It allows AI assistants to read/write scene hierarchies, create GameObjects, manage prefabs, generate 3D models (via Meshy AI), create animations, manage input actions, generate images/audio, and much more — all without leaving the conversation.

## Prerequisites

- Python >= 3.11 (use 3.12 specifically on Windows — see Windows Gotchas)
- Unity Editor (2021.3+ recommended, 2022/6000+ for full feature support)
- `uv` or `uvx` (Python package manager) — install via `pip install uv` or `pipx install uv`
- CoPlay Unity plugin installed in your Unity project

## Installation

### Step 1: Install the Unity Plugin

1. Open Unity Editor
2. Go to **Window > Package Manager**
3. Click **+** > **Add package from git URL**
4. Enter the CoPlay package URL (check [CoPlay docs](https://docs.coplay.dev) for the latest)
5. The plugin adds an MCP listener inside Unity. After install, CoPlay adds its own menu to Unity's top toolbar (the menu name is "CoPlay", not "Claude MCP" as some older docs say).

### Step 2: Configure Claude Code

Add to your `~/.claude.json` under `"mcpServers"`:

```json
{
  "coplay-mcp": {
    "type": "stdio",
    "command": "uvx",
    "args": ["--no-cache", "--python", "3.12", "coplay-mcp-server@latest"],
    "env": {
      "MCP_TOOL_TIMEOUT": "720000"
    }
  }
}
```

**Key config notes:**
- `--no-cache` (Windows): bypasses uv's package cache to avoid a Defender/indexer-induced file-lock that causes pywin32 install to fail. Costs ~30s extra startup per Claude Code session (re-downloads ~75 packages each launch). Drop on macOS/Linux.
- `--python 3.12` ensures the correct Python version is used. Avoid `>=3.11` on Windows because it picks Python 3.14 (newest match available via uv) and 3.14's pywin32 wheel may not exist or may fail to install. 3.12 is the most broadly supported across native-extension Python libraries today.
- `@latest` always pulls the newest CoPlay server version.
- `MCP_TOOL_TIMEOUT` is set to 720000ms (12 minutes) because 3D model generation and other AI operations can take a long time.

### Step 3: Set Project Root

When starting a session, call `set_unity_project_root` with the path to your Unity project. This is required before using any other CoPlay tools.

## Configuration

### Project-Specific Permissions

In your Unity project's `.claude/settings.local.json`, you can restrict which tools are available:

```json
{
  "permissions": {
    "allow": [
      "mcp__coplay-mcp__*"
    ]
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_TOOL_TIMEOUT` | `60000` | Timeout in ms for MCP tool calls. Set high for AI generation tasks. |

## Key Capabilities

### Scene Management
- `list_game_objects_in_hierarchy` — Browse scene hierarchy
- `create_game_object` — Create primitives or empty objects
- `get_game_object_info` — Inspect components, transforms, AABB
- `set_transform` / `set_property` — Modify object properties
- `delete_game_object` — Remove objects
- `create_scene` / `open_scene` / `save_scene` — Scene file management

> ⚠️ `create_scene` can intermittently time out (60s server-side timeout) on large projects or when the Editor is busy. As a workaround, use `execute_script` with a short Editor script calling `EditorSceneManager.NewScene` + `EditorSceneManager.SaveScene` for batched creation.

### Prefab Workflow
- `create_prefab` — Save scene objects as prefabs
- `create_prefab_variant` — Create prefab variants
- `add_nested_object_to_prefab` — Nest objects in prefabs

### Editor Scripting Escape Hatch
- `execute_script` — runs an arbitrary public static C# method from a file in `Assets/Editor/...`. Invaluable when you need to do many Editor-side operations atomically (e.g., create scene + populate + save + update build settings) without paying per-call MCP latency. Wrap your method in a class with a `public static void Execute()` entry point and pass `methodName: "Execute"`.

### 3D Model Generation (Meshy AI)
- `generate_3d_model_from_text` — Text-to-3D
- `generate_3d_model_from_image` — Image-to-3D
- `generate_3d_model_texture` — Retexture existing models
- `auto_rig_3d_model` — Auto-rig humanoid models
- `apply_animation_to_rigged_model` — Apply animations from library

### Animation System
- `create_animation_clip` / `set_animation_curves` — Create animations
- `create_animator_controller` / `modify_animator_controller` — State machines
- `create_blend_tree_state` — Blend trees for locomotion

### Image/Audio Generation
- `generate_or_edit_images` — AI image generation (GPT Image 1 or Gemini)
- `generate_sfx` — Sound effect generation
- `generate_music` — Music generation
- `generate_tts` — Text-to-speech

### Input System
- `create_input_action_asset` — New input action assets
- `add_action` / `add_bindings` / `add_composite_binding` — Configure inputs

### UI
- `create_ui_element` — Buttons, text, panels, etc.
- `set_rect_transform` / `set_ui_text` / `set_ui_layout` — Style UI

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Connection refused" errors | Ensure Unity Editor is open and CoPlay plugin is installed |
| Tool calls timing out | Increase `MCP_TOOL_TIMEOUT` (especially for AI generation). For `create_scene` specifically, fall back to `execute_script` with `EditorSceneManager.NewScene`. |
| `set_unity_project_root` fails | Verify the path points to a valid Unity project with Assets/ folder |
| Python version errors | Ensure Python 3.12 is installed via `uv python install 3.12` and `uvx` can find it |
| Model generation hangs | Check Meshy AI API status; generation can take 2-5 minutes |
| `hasCompilationErrors: true` but `check_compile_errors` returns "No compile errors" | The two report different layers and `get_unity_editor_state` is sometimes stale by ~1 frame. Trust `check_compile_errors`. Re-poll `get_unity_editor_state` once and it usually agrees. |

## Windows Gotchas

### 1. uv cache file-lock during install (causes "Failed to install: pywin32" → MCP server fails to start)

Symptom in `claude mcp list`:
```
coplay-mcp: uvx --python >=3.11 coplay-mcp-server@latest - ✗ Failed to connect
```

Symptom when launching `uvx` manually:
```
error: Failed to install: pywin32-311-cp312-cp312-win_amd64.whl (pywin32==311)
  Caused by: failed to remove directory `C:\...\AppData\Local\uv\cache\builds-v0\.tmp.../Lib/site-packages/pywin32-311.data`:
  The process cannot access the file because it is being used by another process. (os error 32)
```

**Cause:** Some combination of Windows Defender real-time scanning, Windows Search indexer, or a lingering handle from a prior failed install holds files in `C:\Users\<user>\AppData\Local\uv\cache\builds-v0\` while uv tries to delete a temp directory. Adding the cache path to Defender exclusions does NOT always fix it (a fresh `pywin32-311.data` extraction is locked the moment it lands). Even `uv cache clean` fails with the same error.

**Fix:** Add `--no-cache` to the args list. uvx then bypasses the cache entirely and does a fresh, isolated install per launch:

```json
"args": ["--no-cache", "--python", "3.12", "coplay-mcp-server@latest"]
```

Trade-off: ~30s slower MCP server cold-start per Claude Code session (re-downloads ~75 packages every launch). After warm-up the server runs normally.

If you want the cache back (faster startup) once the lock clears: reboot Windows, then `rm -rf "$LOCALAPPDATA/uv/cache"` and remove `--no-cache`.

### 2. Pin Python to 3.12, not `>=3.11`

uvx's `>=3.11` matches the **newest** installed major version, not the lowest. As of 2026 that means Python 3.14, which is bleeding-edge: `pywin32` (and other native-extension libraries) may not have a working wheel yet, or wheel install hooks fail. Pin to `3.12` — broadest compatibility — and explicitly install it once:

```bash
uv python install 3.12
```

### 3. Defender exclusion (helpful but not sufficient)

Adding the uv cache to Windows Defender exclusions is good hygiene and reduces (but does not eliminate) lock-during-install failures:

```powershell
# admin PowerShell
Add-MpPreference -ExclusionPath "C:\Users\<user>\AppData\Local\uv\cache"
```

In observed cases this alone did NOT release the pywin32 lock. Use `--no-cache` as the primary fix.

## Unity 6 / URP 17 — Light2D assembly rename

This isn't a CoPlay issue but it bites projects that use CoPlay because so much CoPlay-driven scene work touches Light2D-using scripts. URP 17 (the URP version that ships with Unity 6) renamed the 2D runtime assembly:

- **URP ≤ 16:** `Light2D` lived in `Unity.RenderPipelines.Universal.2D`
- **URP 17 (Unity 6):** `Light2D` lives in `Unity.RenderPipelines.Universal.2D.Runtime` (note the `.Runtime` suffix)

If your `.asmdef` references the old name, `Light2D` will fail to resolve with `error CS0246`. Verify the actual assembly name by reading the package's own asmdef:

```
Library/PackageCache/com.unity.render-pipelines.universal@<hash>/Runtime/2D/Unity.RenderPipelines.Universal.2D.Runtime.asmdef
```

Whatever the `"name"` field there says is what you reference. For Unity 6 / URP 17 it is `Unity.RenderPipelines.Universal.2D.Runtime`.

## Platform Notes

- **Windows**: Use forward slashes in paths when calling tools, or escape backslashes
- Unity project paths must be absolute
- The server communicates with Unity via HTTP on localhost

## Related Tools

- [Unity MCP Server](unity-mcp-server.md) — Alternative/complementary Unity MCP integration
- [Meshy AI](https://meshy.ai) — Powers the 3D model generation features

## References

- [CoPlay Documentation](https://docs.coplay.dev)
- [CoPlay MCP on PyPI](https://pypi.org/project/coplay-mcp-server/)

---

*Last updated: 2026-04-28*
*Setup verified on: Windows 10/11 (Unity 6000.4.2f1, URP 17.4.0, Python 3.12, uvx 0.11.3)*
