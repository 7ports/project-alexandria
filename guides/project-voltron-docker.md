# Project Voltron — Docker Agent Auth Fix

## Problem

When running specialist agents via `mcp__project-voltron__run_agent_in_docker`, agents inside the Docker container fail with:

```
Not logged in · Please run /login
```

This happens even though `~/.claude.json` and `~/.claude/` are correctly volume-mounted into the container.

## Root Cause

On Windows, Claude Code authenticates via OAuth and stores the session token in the `CLAUDE_CODE_OAUTH_TOKEN` **environment variable** (set by the Claude Code desktop app process). This token is NOT persisted to any file on disk — it lives only in the host process environment.

The Docker container inherits no environment variables from the host by default, so `CLAUDE_CODE_OAUTH_TOKEN` is absent and claude CLI reports "not logged in" even with the credential files mounted.

## Fix (in `project-voltron/src/index.js`)

Add auth env var passthrough to the `dockerArgs` array in `run_agent_in_docker`:

```javascript
// Pass through Claude auth env vars so the agent inside Docker can authenticate
const authEnvArgs = [];
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  authEnvArgs.push("-e", `CLAUDE_CODE_OAUTH_TOKEN=${process.env.CLAUDE_CODE_OAUTH_TOKEN}`);
}
if (process.env.ANTHROPIC_API_KEY) {
  authEnvArgs.push("-e", `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY}`);
}

const dockerArgs = [
  "run", "--rm",
  "--entrypoint", "bash",
  ...authEnvArgs,   // <-- add before volume mounts
  "-v", `${cwd}:/workspace`,
  // ... rest of args
];
```

## Quick Verification

Test that auth works inside Docker before spending time debugging agent prompts:

```bash
docker run --rm \
  -e "CLAUDE_CODE_OAUTH_TOKEN=$CLAUDE_CODE_OAUTH_TOKEN" \
  -v "C:/Users/$USERNAME/.claude:/home/voltron/.claude" \
  --entrypoint bash \
  voltron-agent \
  -c "claude config list 2>&1 | head -3"
```

If it prints config output (not "Not logged in"), auth is working.

## Notes

- `CLAUDE_CODE_OAUTH_TOKEN` is set automatically by the Claude Code desktop app — it is available in any shell session launched from the desktop app
- `ANTHROPIC_API_KEY` is the alternative for API-key-based auth (not OAuth) — pass through both to support either auth method
- The fix requires a Voltron MCP server restart to take effect (restart Claude Code)
- Volume-mounting `~/.claude.json` and `~/.claude/` is still correct — those files store preferences and cached data, not the OAuth session token

## History

- Voltron v2.3.5 fixed the YAML frontmatter `---` parsing issue (agents were failing with "unknown option '---'")
- The OAuth token passthrough issue was discovered during project-hammer Phase 5 deploy on 2026-04-06
- Fix was applied directly to `project-voltron/src/index.js` — should be upstreamed to the Voltron project
