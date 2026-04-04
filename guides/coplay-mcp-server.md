# CoPlay MCP Server (Unity Integration)

## Quick Reference

**Install:** Requires `uvx` (`pip install uv`) and CoPlay Unity plugin in your project.

**Claude Code config** (`~/.claude.json` → `mcpServers`):
```json
{
  "coplay-mcp": {
    "type": "stdio",
    "command": "uvx",
    "args": ["--python", ">=3.11", "coplay-mcp-server@latest"],
    "env": { "MCP_TOOL_TIMEOUT": "720000" }
  }
}
```

**First use:** Call `set_unity_project_root` with the absolute path to your Unity project.

## Overview

CoPlay MCP Server provides deep Unity Editor integration via the Model Context Protocol. It allows AI assistants to read/write scene hierarchies, create GameObjects, manage prefabs, generate 3D models (via Meshy AI), create animations, manage input actions, generate images/audio, and much more — all without leaving the conversation.

## Prerequisites

- Python >= 3.11
- Unity Editor (2021.3+ recommended, 2022/6000+ for full feature support)
- `uv` or `uvx` (Python package manager) — install via `pip install uv` or `pipx install uv`
- CoPlay Unity plugin installed in your Unity project

## Installation

### Step 1: Install the Unity Plugin

1. Open Unity Editor
2. Go to **Window > Package Manager**
3. Click **+** > **Add package from git URL**
4. Enter the CoPlay package URL (check [CoPlay docs](https://docs.coplay.dev) for the latest)
5. The plugin adds an MCP listener inside Unity

### Step 2: Configure Claude Code

Add to your `~/.claude.json` under `"mcpServers"`:

```json
{
  "coplay-mcp": {
    "type": "stdio",
    "command": "uvx",
    "args": ["--python", ">=3.11", "coplay-mcp-server@latest"],
    "env": {
      "MCP_TOOL_TIMEOUT": "720000"
    }
  }
}
```

**Key config notes:**
- `--python >=3.11` ensures the correct Python version is used
- `@latest` always pulls the newest version
- `MCP_TOOL_TIMEOUT` is set to 720000ms (12 minutes) because 3D model generation and other AI operations can take a long time

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

### Prefab Workflow
- `create_prefab` — Save scene objects as prefabs
- `create_prefab_variant` — Create prefab variants
- `add_nested_object_to_prefab` — Nest objects in prefabs

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
| Tool calls timing out | Increase `MCP_TOOL_TIMEOUT` (especially for AI generation) |
| `set_unity_project_root` fails | Verify the path points to a valid Unity project with Assets/ folder |
| Python version errors | Ensure Python 3.11+ is installed and `uvx` can find it |
| Model generation hangs | Check Meshy AI API status; generation can take 2-5 minutes |

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

*Last updated: 2026-04-04*
*Setup verified on: Windows 10, Unity 6, Python 3.11+*
