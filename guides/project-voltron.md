# Project Voltron

## Quick Reference

**Location:** `C:\Users\Raj\Documents\nongamerepos\project-voltron`

**Claude Code config** (`~/.claude.json` → `mcpServers`):
```json
{
  "project-voltron": {
    "type": "stdio",
    "command": "node",
    "args": ["C:/Users/Raj/Documents/nongamerepos/project-voltron/src/index.js"]
  }
}
```

**Verify:** Open a new Claude Code session and run `list_templates` — you should see 13 templates.

**Scaffold a new project:**
```
# In Claude Code — ask Claude to:
Use project-voltron to scaffold a [unity|web|fullstack|general] project.
```

**Add auto-update hook to an existing project:**
```
Use project-voltron get_auto_update_hook for this project.
```

**Check for agent updates (manual):**
```
Use project-voltron check_for_updates for this project.
```

## Overview

Project Voltron is an MCP server that provides a team of specialized Claude Code subagents (`.claude/agents/`) along with CLAUDE.md project context templates. It includes:

- **10 specialist agents** for Unity, web/fullstack, and general development
- **A scrum-master coordinator** that plans work and assigns tasks
- **Alexandria integration** — agents consult and update the shared tooling knowledge base
- **A self-improvement loop** — post-session reflections feed back into template improvements
- **Auto-update** — installed agents update themselves to the latest templates on session start

**Version:** 2.2.0

## Prerequisites

- Node.js 18+
- Claude Code CLI
- Access to `C:\Users\Raj\Documents\nongamerepos\project-voltron`
- **Recommended:** Project Alexandria MCP server (for full agent capabilities)

## Installation

Project Voltron is used as a local MCP server (not installed via npm globally). It lives at a fixed path and is registered in `~/.claude.json`.

### Windows

1. Verify Node.js is installed:
   ```bash
   node --version
   ```

2. Verify the server starts correctly:
   ```bash
   node C:/Users/Raj/Documents/nongamerepos/project-voltron/src/index.js
   ```
   It should hang waiting for MCP input (that's correct — press Ctrl+C).

3. Add to `~/.claude.json` under `mcpServers`:
   ```json
   {
     "project-voltron": {
       "type": "stdio",
       "command": "node",
       "args": ["C:/Users/Raj/Documents/nongamerepos/project-voltron/src/index.js"]
     }
   }
   ```

4. Restart Claude Code and verify with `list_templates`.

## Configuration

### Claude Code Integration

The MCP server is configured globally in `~/.claude.json`. All projects have access to the `mcp__project-voltron__*` tools automatically.

### Permissions

No special permissions required — Voltron tools are read-only except `submit_reflection` (writes JSON to the voltron repo) and `update_agent` / `check_for_updates` (write agent files to the current project).

## Usage

### Available MCP Tools

| Tool | Purpose |
|---|---|
| `list_templates` | List all 13 templates (filter by `project_type`) |
| `get_template` | Fetch full content of a specific template by name |
| `scaffold_project` | Get all files + auto-update hook to scaffold a project type |
| `get_auto_update_hook` | Get `.claude/settings.json` hook for existing projects |
| `get_agent_usage_guide` | Usage guide and recommended workflow |
| `check_for_updates` | Validate installed agents match current server version |
| `update_agent` | Get latest content for a specific agent |
| `submit_reflection` | Save post-session feedback to improve templates |
| `list_reflections` | List stored post-session reflections |

### Agent Team

| Agent | Invoke With | Use When |
|---|---|---|
| **scrum-master** | `@agent-scrum-master` | Always — plans work and assigns tasks to other agents |
| **csharp-dev** | `@agent-csharp-dev` | Unity C# scripts |
| **scene-architect** | `@agent-scene-architect` | Unity scenes, prefabs, hierarchy |
| **shader-artist** | `@agent-shader-artist` | Unity shaders, materials, VFX |
| **build-validator** | `@agent-build-validator` | Unity compile + Play Mode checks |
| **asset-manager** | `@agent-asset-manager` | Unity asset organization |
| **fullstack-dev** | `@agent-fullstack-dev` | React/TypeScript + Node.js/Express |
| **devops-engineer** | `@agent-devops-engineer` | Docker, CI/CD, Terraform, cloud |
| **ui-designer** | `@agent-ui-designer` | CSS, responsive design, PWA |
| **qa-tester** | `@agent-qa-tester` | Tests, Lighthouse, quality gates |

### Recommended Workflow

1. **Scaffold:** Ask Claude to scaffold the project for your type (unity/web/fullstack/general). This writes `CLAUDE.md` + all relevant agent `.md` files to `.claude/agents/`, plus a `.claude/settings.json` auto-update hook.

2. **Fill in CLAUDE.md:** Update project name, tech stack, repository layout, and code conventions. This is critical — agents read it for context.

3. **Plan with scrum-master:** Give `@agent-scrum-master` your backlog or requirements. Before planning, it calls Alexandria's `get_project_setup_recommendations` to ensure the right tools are in scope.

4. **Invoke specialists:** Claude dispatches the agents in the plan. Each agent is scoped to its domain and consults Alexandria before setting up any tool.

5. **Reflect:** At session end, have scrum-master call `submit_reflection`. It also syncs any tool-specific findings to Alexandria via `update_guide`.

### Scaffolding Example

Ask Claude:
```
Use project-voltron to scaffold a fullstack project for this repo.
Then fill in the CLAUDE.md with: project name "my-app", React + TypeScript frontend, Node.js/Express backend.
```

## Auto-Update Mechanism

When a project is scaffolded with Voltron, a `UserPromptSubmit` hook is written to `.claude/settings.json`. At the start of every Claude Code session:

1. `scripts/auto-update-agents.js` runs automatically
2. It reads the installed version from `.claude/agents/scrum-master.md`
3. It reads the current version from Voltron's `package.json`
4. If versions differ, all installed agent `.md` files are overwritten with current templates
5. A `[VOLTRON] Auto-updated N agent(s)` message appears in Claude's context

This means agents stay current with every template improvement without any manual action.

**For projects scaffolded before v2.2.0** — add the hook manually:
```
Use project-voltron get_auto_update_hook for this project.
```
Then add the returned JSON to your project's `.claude/settings.json`.

## Alexandria Integration

Voltron agents are deeply integrated with Project Alexandria. When both MCP servers are installed:

- **scrum-master** calls `get_project_setup_recommendations` when planning new projects, and syncs tool discoveries to Alexandria at session end
- **fullstack-dev** and **devops-engineer** call `quick_setup` before installing any tool and `update_guide` after discovering workarounds
- All agents can call `search_guides` for known issues and `quick_setup` for setup procedures
- Tool knowledge flows in both directions: Voltron's reflection pipeline improves agent behavior; Alexandria accumulates concrete setup steps from those sessions

## Self-Improvement Loop

Voltron has a built-in feedback mechanism:

1. `submit_reflection` → writes JSON to `reflections/` in the Voltron repo
2. GitHub Actions (Mon/Wed/Fri 10:00 UTC) processes unprocessed reflections
3. A Claude agent applies improvements to `src/templates.js`
4. Version is bumped, PR opened → reviewed → merged
5. Projects with the auto-update hook get the new templates at the start of their next session
6. Projects without the hook can run `check_for_updates` manually

To review pending improvements: `list_reflections` with `unprocessed_only: true`.

## Troubleshooting

| Issue | Solution |
|---|---|
| `list_templates` returns nothing | Verify `~/.claude.json` has the correct `project-voltron` MCP entry and node path |
| Agent file writes fail | Ensure `.claude/agents/` directory exists in your project root |
| `submit_reflection` fails git push | Reflection is saved locally anyway — git failure doesn't lose data |
| Agents don't have context | Fill in `CLAUDE.md` — agents rely on it for project details |
| Auto-update hook not running | Check `.claude/settings.json` has the `UserPromptSubmit` hook; verify Node.js is in PATH |
| Auto-update says "unknown version" | scrum-master.md may have been modified — the `**Version:**` line was removed |
| Alexandria tools not available | Ensure the Alexandria MCP server is also configured in `~/.claude.json` |

## Platform Notes

- **Windows path in config:** Use forward slashes (`C:/Users/...`) in `~/.claude.json` args
- **Agents read CLAUDE.md first:** Every agent template starts by reading CLAUDE.md. If CLAUDE.md is missing or empty, agent quality degrades significantly
- **Parallel agent execution:** Claude can dispatch multiple agents simultaneously for parallelizable tasks
- **Template content is bundled:** All 13 templates are embedded as strings in `src/templates.js` — no external files needed at runtime
- **Auto-update hook path:** The hook path embeds the absolute Voltron installation path — if you move the Voltron directory, re-scaffold or update the hook path in `.claude/settings.json`

## Related Tools

- [Alexandria MCP Server](alexandria-mcp-server.md) — Companion knowledge base; required for full agent capabilities
- [GitHub MCP Server](github-mcp-server.md) — Used by Voltron's auto-commit for reflections
- [Rancher Desktop on Windows](rancher-desktop-windows.md) — Required for devops-engineer Docker workflows

## References

- [Project Voltron Repo](file:///C:/Users/Raj/Documents/nongamerepos/project-voltron)
- [MCP SDK Docs](https://modelcontextprotocol.io)

---

*Last updated: 2026-04-05*
*Setup verified on: Windows 10, Node.js 18+*
