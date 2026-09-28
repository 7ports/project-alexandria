# coplay-mcp-server (Unity Editor MCP)

`coplay-mcp-server` is a stdio MCP server (FastMCP) that exposes Unity Editor control tools (`get_unity_editor_state`, `check_compile_errors`, scene/prefab/component ops, etc.) to an MCP client such as Claude Code. It is typically launched via `uvx`.

## Quick Reference — working config

In the client's MCP config (`~/.claude.json` → `mcpServers`):

```json
"coplay-mcp": {
  "type": "stdio",
  "command": "uvx",
  "args": ["--python", "3.12", "coplay-mcp-server@latest"],
  "env": { "MCP_TOOL_TIMEOUT": "720000" }
}
```

Requires: `uv`/`uvx` on PATH (`uvx --version`), the Coplay Unity package installed and the Editor open + logged in (so the server can reach the Editor).

## Gotcha — `--no-cache` makes tools never bind (connection timeout)

Symptom: the coplay-mcp tools (`mcp__coplay-mcp__*`) are **unbound** — a probe agent reports them unavailable and makes 0 tool calls; at client startup coplay is never listed as connected while other MCP servers are. Restarting the Unity Editor does NOT fix it, because the failure is the MCP *server process* not finishing its connection handshake, not the Editor being down.

Root cause: an `args` entry of `--no-cache` forces `uvx` to **re-download the full dependency set (~70+ packages: cryptography, pydantic-core, pywin32, …) on every launch**. That cold start overruns the client's MCP *connection/init* timeout (which is separate from and much shorter than any per-tool-call timeout like `MCP_TOOL_TIMEOUT`). The client marks the server failed before it's ready.

Diagnose:
- `command -v uvx && uvx --version` — confirm uvx exists.
- `echo "" | uvx --no-cache --python 3.12 coplay-mcp-server@latest 2>&1 | head` — if it eventually prints the FastMCP banner, the server itself is fine and the problem is startup latency, not the package. (An empty-stdin run will log a JSONRPC validation error — that's just the invalid test message, not a real fault.)

Fix:
1. Remove `--no-cache` from the `args` so uvx reuses its cached environment (near-instant subsequent launches).
2. Warm the cache once: `echo "" | uvx --python 3.12 coplay-mcp-server@latest` (let it print the banner, then kill it).
3. **Fully restart the MCP client** (quit + relaunch — the config is read at startup and edited config can be clobbered on exit if edited while running). Edit the config while the client is closed.
4. Verify the Coplay Unity Editor window is open/connected so the now-bound tools can actually reach the Editor.

General lesson (applies to ANY `uvx`/`npx`-launched stdio MCP server): avoid `--no-cache` in the launch args — cold dependency downloads on every start commonly exceed the client's connection timeout and leave the tools unbound. Cache + warm instead.
