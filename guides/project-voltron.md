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

**Check for agent updates:**
```
Use project-voltron check_for_updates for this project.
```

## Overview

Project Voltron is an MCP server that provides a team of specialized Claude Code subagents (`.claude/agents/`) along with CLAUDE.md project context templates. It also includes a self-improvement feedback loop: after each session, agents can submit reflections that are processed and applied back into the templates.

**Core value:** Instead of configuring Claude's behavior from scratch each project, Voltron gives you battle-tested, role-scoped agents for Unity, web/fullstack, and general development — all coordinated by a scrum-master agent.

**Version:** 2.1.0

## Prerequisites

- Node.js 18+
- Claude Code CLI
- Access to `C:\Users\Raj\Documents\nongamerepos\project-voltron`

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

The MCP server is already configured globally in `~/.claude.json`. All projects have access to the `mcp__project-voltron__*` tools automatically.

### Permissions

No special permissions required — Voltron tools are read-only except for `submit_reflection` (writes JSON to the voltron repo) and `update_agent` / `check_for_updates` (write agent files to the current project).

## Usage

### Available MCP Tools

| Tool | Purpose |
|---|---|
| `list_templates` | List all 13 templates (filter by `project_type`) |
| `get_template` | Fetch full content of a specific template by name |
| `scaffold_project` | Get all files to scaffold a project type |
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

1. **Scaffold:** Ask Claude to scaffold the project for your type (unity/web/fullstack/general). This writes `CLAUDE.md` + all relevant agent `.md` files to `.claude/agents/`.

2. **Fill in CLAUDE.md:** Update project name, tech stack, repository layout, and code conventions. This is critical — agents read it for context.

3. **Plan with scrum-master:** Give `@agent-scrum-master` your backlog or requirements. It produces a phased work plan with explicit dependencies.

4. **Invoke specialists:** Claude dispatches the agents in the plan. Each agent is scoped to its domain and won't overstep.

5. **Reflect:** At session end, have scrum-master call `submit_reflection`. Feedback is processed back into Voltron's templates.

### Scaffolding Example

Ask Claude:
```
Use project-voltron to scaffold a fullstack project for this repo.
Then fill in the CLAUDE.md with: project name "my-app", React + TypeScript frontend, Node.js/Express backend.
```

### Checking for Updates

```
Use project-voltron check_for_updates for this project. 
Apply any outdated agent files.
```

### Submitting a Reflection

At the end of a session, tell the scrum-master agent:
```
Session is wrapping up — please submit a reflection.
```

Or invoke directly:
```
Call submit_reflection with: project_name="my-project", project_type="fullstack", 
session_summary="...", agents_used=[...], agent_feedback=[...], overall_notes="..."
```

## Troubleshooting

| Issue | Solution |
|---|---|
| `list_templates` returns nothing | Verify `~/.claude.json` has the correct `project-voltron` MCP entry and node path is correct |
| Agent file writes fail | Ensure `.claude/agents/` directory exists in your project root |
| `submit_reflection` fails git push | Reflection is saved locally in `reflections/` anyway — git failure doesn't lose data |
| Agents don't have context | Check that `CLAUDE.md` is filled in — agents rely on it for project details |
| `check_for_updates` shows all outdated | Normal on first run — apply updates and re-check |
| Agent invoked wrong specialist | Ensure scrum-master reads CLAUDE.md agent table before planning — re-run if needed |

## Platform Notes

- **Windows path in config:** Use forward slashes (`C:/Users/...`) in `~/.claude.json` args — Node.js handles them correctly on Windows.
- **Agents read CLAUDE.md first:** Every agent template starts by reading CLAUDE.md. If CLAUDE.md is missing or empty, agent quality degrades significantly.
- **Parallel agent execution:** Claude can dispatch multiple agents simultaneously for parallelizable tasks — this is how Voltron achieves real speed gains.
- **Template content is bundled:** All 13 templates are embedded as strings in `src/templates.js` — no external files needed at runtime.

## Self-Improvement Loop

Voltron has a built-in feedback mechanism:

1. `submit_reflection` → writes JSON to `reflections/` in the Voltron repo
2. GitHub Actions (Mon/Wed/Fri 10:00 UTC) processes unprocessed reflections
3. A Claude agent applies improvements to `src/templates.js`
4. PR opened → reviewed → merged
5. Projects pull improvements via `check_for_updates`

To manually review pending improvements: `list_reflections` with `unprocessed_only: true`.

## Related Tools

- [Alexandria MCP Server](alexandria-mcp-server.md) — Tooling documentation system; Voltron agents benefit from access to Alexandria guides
- [GitHub MCP Server](github-mcp-server.md) — Used by Voltron's auto-commit for reflections
- [Rancher Desktop on Windows](rancher-desktop-windows.md) — Required for devops-engineer Docker workflows

## References

- [Project Voltron Repo](file:///C:/Users/Raj/Documents/nongamerepos/project-voltron)
- [MCP SDK Docs](https://modelcontextprotocol.io)

---

*Last updated: 2026-04-05*
*Setup verified on: Windows 10, Node.js 18+*
