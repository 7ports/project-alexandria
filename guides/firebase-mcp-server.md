# Firebase MCP Server

## Quick Reference

**Install:** Requires Node.js 18+.

**Claude Code config** (`~/.claude.json` → `mcpServers`):
```json
{
  "firebase": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "firebase-tools@latest", "mcp"]
  }
}
```

**First use:** Call `firebase_login` to authenticate via browser OAuth.

## Overview

Provides Firebase project management via MCP. Allows AI assistants to manage Firebase projects, apps, authentication, Firestore, Realtime Database, Hosting, Storage, Data Connect, and more through structured tool calls.

## Prerequisites

- Node.js (v18+)
- npm/npx available on PATH
- A Google account with Firebase access
- Firebase CLI authentication (handled via the MCP server's login tool)

## Installation

Add to your `~/.claude.json` under `"mcpServers"`:

```json
{
  "firebase": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "firebase-tools@latest", "mcp"]
  }
}
```

## Authentication

Use the `firebase_login` tool to authenticate. This opens a browser-based OAuth flow. You only need to do this once per session (credentials persist).

```
firebase_login → opens browser → sign in with Google → return auth code → authenticated
```

Check auth status with `firebase_get_environment`.

## Key Capabilities

### Project Management
- `firebase_list_projects` — List accessible projects
- `firebase_get_project` — Get active project details
- `firebase_create_project` — Create new projects
- `firebase_update_environment` — Switch active project/directory

### App Management
- `firebase_list_apps` — List registered apps (iOS/Android/Web)
- `firebase_create_app` — Register new apps
- `firebase_get_sdk_config` — Get SDK configuration
- `firebase_create_android_sha` — Add SHA certificates

### Service Initialization
- `firebase_init` — Initialize services (Firestore, RTDB, Hosting, Storage, Data Connect, Auth, AI Logic)

### Security Rules
- `firebase_get_security_rules` — Read rules for Firestore, RTDB, or Storage

### Documentation Search
- `developerknowledge_search_documents` — Search Google developer docs
- `developerknowledge_get_documents` — Read full doc content

## Workflow Example

```
1. firebase_login                    # Authenticate
2. firebase_update_environment       # Set project directory
3. firebase_list_projects            # See available projects
4. firebase_update_environment       # Set active project
5. firebase_init                     # Initialize services
6. firebase_get_sdk_config           # Get config for your app
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not authenticated" | Run `firebase_login` |
| "No active project" | Run `firebase_update_environment` with `active_project` |
| Init fails | Ensure the project directory has a `firebase.json` or will have one |
| `npx` version conflicts | Use `firebase-tools@latest` to ensure latest version |

## References

- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
- [Firebase MCP Integration](https://firebase.google.com/docs/cli#mcp)

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10*
