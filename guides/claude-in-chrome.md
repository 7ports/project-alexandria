# Claude in Chrome (Browser Automation)

## Overview

Claude in Chrome is a browser extension that allows Claude Code to control a Chrome browser — taking screenshots, clicking elements, filling forms, reading page content, navigating, and more. Enables web-based automation workflows directly from Claude conversations.

## Prerequisites

- Google Chrome browser
- Claude in Chrome extension installed from the Chrome Web Store

## Installation

### Step 1: Install the Extension

1. Open Chrome and go to the Chrome Web Store
2. Search for "Claude in Chrome" (or navigate directly to the extension page)
3. Click **Add to Chrome**
4. The extension icon appears in your toolbar

### Step 2: Connect to Claude Code

The extension automatically registers as an MCP server when Claude Code starts. No manual config in `.claude.json` is needed — the extension handles the connection.

If you need to switch which Chrome browser is connected, use the `switch_browser` tool, which broadcasts a connection request to all browsers with the extension.

## Key Capabilities

### Tab Management
- `tabs_context_mcp` — Get current tab group info (call this first!)
- `tabs_create_mcp` — Create new tabs
- `tabs_close_mcp` — Close tabs

### Navigation & Interaction
- `navigate` — Go to URLs, back/forward
- `computer` — Click, type, scroll, take screenshots, drag, zoom
- `find` — Find elements by natural language description
- `read_page` — Get accessibility tree of page elements
- `get_page_text` — Extract article/page text content

### Form Interaction
- `form_input` — Set values in form fields
- `file_upload` — Upload files to file inputs

### Debugging
- `read_console_messages` — Read browser console output
- `read_network_requests` — Monitor network activity
- `javascript_tool` — Execute JavaScript in page context

### Recording
- `gif_creator` — Record browser sessions as animated GIFs

## Usage Pattern

```
1. tabs_context_mcp (createIfEmpty: true)  # Get/create tab group
2. tabs_create_mcp                          # Create a new tab
3. navigate (url, tabId)                    # Go to a page
4. computer (screenshot, tabId)             # See what's on screen
5. find / read_page                         # Locate elements
6. computer (left_click/type, tabId)        # Interact
```

**Critical:** Always call `tabs_context_mcp` first to get valid tab IDs before using any other tools.

## Tips

- Each new conversation should create its own tab rather than reusing existing ones
- Use `find` for natural language element search ("login button", "search bar")
- Use `read_page` for structured accessibility tree data
- Screenshots are good for layout checks; use `read_page` for precise text/element verification
- The `computer` tool with `zoom` action lets you inspect small UI elements closely
- Never click file upload buttons directly — use `file_upload` with the element ref instead

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No valid tab ID" | Call `tabs_context_mcp` first |
| Extension not connecting | Click the extension icon in Chrome, ensure it's active |
| Wrong browser connected | Use `switch_browser` to reconnect to the correct Chrome instance |
| Can't interact with page | Check if the page uses iframes; may need to target specific frames |
| Screenshots are blank | Tab may be minimized or behind other windows |

## Security Notes

- The extension only interacts with tabs in its managed tab group
- Be cautious with sensitive pages (banking, email) — follow safety protocols
- File uploads go through the extension's secure API, not native file pickers

## References

- Chrome Web Store listing for Claude in Chrome

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10, Chrome*
