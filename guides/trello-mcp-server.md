# Trello MCP Server

Researched: 2026-04-09

## Recommended Package

**`@delorenj/mcp-server-trello`** — the dominant community option.

- npm: `@delorenj/mcp-server-trello`
- GitHub: delorenj/mcp-server-trello
- Version: 1.7.1 (latest as of 2026-04-09)
- Weekly downloads: ~7,468
- Stars: 297 | Forks: 102
- License: MIT | Security: Grade A (no known vulnerabilities)
- Runtime: Node.js (npx) or Bun (bunx, 2.8-4.4x faster)

## Quick Setup (.mcp.json)

```json
{
  "mcpServers": {
    "trello": {
      "command": "npx",
      "args": ["-y", "@delorenj/mcp-server-trello"],
      "env": {
        "TRELLO_API_KEY": "your-32-char-api-key",
        "TRELLO_TOKEN": "your-64-char-token"
      }
    }
  }
}
```

Or with Bun (faster):

```json
{
  "command": "bunx",
  "args": ["@delorenj/mcp-server-trello"]
}
```

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `TRELLO_API_KEY` | Yes | 32 chars, from https://trello.com/power-ups/admin |
| `TRELLO_TOKEN` | Yes | 64 chars, generated via OAuth URL |
| `TRELLO_BOARD_ID` | No | Deprecated; use `set_active_board` tool instead |
| `TRELLO_WORKSPACE_ID` | No | Optional initial workspace |

## Getting Trello Credentials

**API Key:**
1. Go to https://trello.com/power-ups/admin
2. Create or open a Power-Up, go to the "API Key" tab
3. Click "Generate a new API Key"

**Token (never-expiring):**
```
https://trello.com/1/authorize?expiration=never&name=MCP_Server&scope=read,write&response_type=token&key=YOUR_API_KEY
```
Visit the URL, click Allow, copy the token from the redirect page.

Security: API key can be shared; token grants full account access and must stay private.

## Tools Exposed (28 total)

Tool names in Claude Code use the pattern `mcp__<server-key>__<tool_name>` (e.g., `mcp__trello__get_card`).

**Checklist:** `get_checklist_items`, `add_checklist_item`, `find_checklist_items_by_description`, `get_acceptance_criteria`, `get_checklist_by_name`

**Cards:** `get_card`, `get_cards_by_list_id`, `add_card_to_list`, `update_card_details`, `archive_card`, `move_card`, `get_my_cards`

**Attachments:** `attach_image_to_card`, `attach_file_to_card`

**Comments:** `add_comment`, `update_comment`, `delete_comment`, `get_card_comments`

**Board/List:** `get_lists`, `add_list_to_board`, `archive_list`, `list_boards`, `set_active_board`, `get_active_board_info`

**Workspace:** `list_workspaces`, `set_active_workspace`, `list_boards_in_workspace`

**Activity:** `get_recent_activity`

## Alternative: trello-mcp (39 tools)

If you need board create/delete, label CRUD, member search, or full checklist CRUD:

```json
{
  "command": "npx",
  "args": ["-y", "trello-mcp"]
}
```

Same env vars. Package: `trello-mcp` v1.0.3 by EndlessHoper. Much lower adoption (~76 downloads/week as of 2026-04-09) — unproven in production.

## Gotchas

- No official Atlassian-published MCP server exists; all options are community-built
- `bunx` requires Bun installed; `npx` works everywhere with Node
- `TRELLO_BOARD_ID` env var is deprecated in delorenj v1.5+; use `set_active_board` tool at runtime instead
- The old `https://trello.com/app-key` shortcut URL may still work but Atlassian now routes through the Power-Ups admin
