---
id: claude-code-remote-control-auth-and-resume
type: reference
title: "Claude Code Remote Control: setup-tokens are rejected; continuing an existing conversation"
summary: Remote Control refuses CLAUDE_CODE_OAUTH_TOKEN (inference-only) even when a full login exists; and how to bring an existing terminal conversation into Remote Control with --resume/--fork-session/--session-id.
tags:
  - claude-code
  - remote-control
  - auth
  - resume
status: verified
embedding_version: 1
---

# Claude Code Remote Control: auth and continuing a conversation

Verified on Claude Code 2.1.30x, Windows.

## Setup-tokens block Remote Control
`claude remote-control` and `/remote-control` fail with:

```
Remote Control requires a full-scope login token. Long-lived tokens (from `claude setup-token`
or CLAUDE_CODE_OAUTH_TOKEN) are limited to inference-only for security reasons.
```

`CLAUDE_CODE_OAUTH_TOKEN` **takes precedence** over the full login in `~/.claude/.credentials.json`,
so having both still fails. A supervisor that restarts the server sees exit code 1 after ~0 s, in a loop.
- Fix for one process: remove the variable from that process's environment before launching
  `claude` (PowerShell: `Remove-Item Env:CLAUDE_CODE_OAUTH_TOKEN`). The full login is then used.
- If `settings.json` → `env` sets it, Claude Code applies it internally, and only removing it from
  settings helps.
- To check for a full login: `.credentials.json` → `claudeAiOauth.refreshToken` exists.

## Bring an existing conversation into Remote Control
`claude remote-control --continue` and `--session-id` only reattach sessions that Remote Control
itself recorded. To carry an ordinary terminal conversation over, with its history:

```
claude --resume <old-id> --fork-session --session-id <new-uuid> --remote-control "<name>"
```

- `--fork-session` copies the history under a new ID, so the original session can stay open.
  Later work in the original doesn't reach the copy.
- `--session-id` together with `--fork-session` lets you choose the fork's ID. Record it, and
  restart later with `claude --resume <new-uuid> --remote-control "<name>"` so it doesn't fork again.
- `--resume <id>` finds a conversation that was started in a **parent** folder when run from a
  subfolder (tested). The fork's transcript is stored under the folder it was resumed from.
- Live session IDs: `~/.claude/sessions/<pid>.json` (`sessionId`, `cwd`). Transcripts:
  `~/.claude/projects/<sanitized-launch-dir>/<id>.jsonl`, keyed by the folder the session was
  **launched** in, not the one it later worked in.
