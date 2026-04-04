# Claude Preview MCP Server

## Quick Reference

**Install:** Built into Claude Code. No MCP config needed.

**Project config** (`.claude/launch.json`):
```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dev-server",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

**First use:** `preview_start(name: "dev-server")`. Always use this instead of running servers via Bash.

## Overview

Claude Preview provides a built-in dev server launcher and browser preview for Claude Code. It can start local development servers, take screenshots, inspect elements, fill forms, click buttons, monitor network requests, console logs, and test responsive layouts — all within Claude Code conversations.

## Prerequisites

- Claude Code (built-in, no separate installation needed)
- A project with a dev server (e.g., Next.js, Vite, Create React App, etc.)

## Installation

Claude Preview is built into Claude Code. No MCP server configuration needed.

However, you need a `.claude/launch.json` file in your project to tell it how to start your dev server:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "dev-server",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

## Key Capabilities

### Server Management
- `preview_start` — Start a dev server by name from `launch.json`
- `preview_stop` — Stop a running server
- `preview_list` — List running servers

### Visual Inspection
- `preview_screenshot` — Capture page screenshot (JPEG)
- `preview_inspect` — Inspect element CSS properties (more accurate than screenshots for colors/fonts)
- `preview_snapshot` — Accessibility tree snapshot (best for verifying text/structure)

### Interaction
- `preview_click` — Click elements by CSS selector
- `preview_fill` — Fill form inputs by CSS selector
- `preview_eval` — Execute JavaScript for debugging/inspection

### Debugging
- `preview_console_logs` — Read browser console output
- `preview_network` — List network requests or inspect response bodies
- `preview_logs` — Read server stdout/stderr

### Responsive Testing
- `preview_resize` — Test at different viewport sizes (mobile/tablet/desktop presets or custom)

## Usage Pattern

```
1. Create .claude/launch.json with your server config
2. preview_start (name: "dev-server")      # Start the server
3. preview_screenshot                       # See the page
4. preview_inspect (selector: ".button")    # Check specific styles
5. preview_click / preview_fill             # Interact
6. preview_console_logs                     # Debug issues
```

## Tips

- Use `preview_inspect` over screenshots for verifying colors, fonts, spacing, and dimensions
- Use `preview_snapshot` over screenshots for verifying text content and element presence
- Screenshots are compressed JPEG — good for layout, not precise style verification
- `preview_eval` is for debugging only — don't use it to implement UI changes (edit source code instead)
- Always use `preview_start` instead of running servers via Bash

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Server won't start | Check `.claude/launch.json` config; verify the command works manually |
| Port conflict | Change the port in `launch.json` and your dev server config |
| Blank screenshots | Server may not be fully started; wait and retry |
| CSS inspection wrong | Use more specific selectors; pseudo-elements may not be captured |

## References

- Built into Claude Code — no external documentation needed

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10*
