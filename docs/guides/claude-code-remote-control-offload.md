---
id: claude-code-remote-control-offload
type: guide
title: "Claude Code Remote Control: offload sessions to an always-on machine"
summary: "Run Claude Code sessions on a home/desktop machine via `claude remote-control` server mode and drive them from claude.ai/code or the mobile app; keepalive, keep-awake, auto-start, guardrails and gotchas (Windows-focused)."
tags:
  - claude-code
  - remote-control
  - windows
  - automation
  - powershell
status: active
source_urls:
  - "https://code.claude.com/docs/en/remote-control"
embedding_version: 1
---

# Claude Code Remote Control: offload sessions to an always-on machine

## Quick Reference

```powershell
# on the always-on machine, inside a git repo
claude remote-control --spawn worktree --capacity 4 --permission-mode auto --remote-control-session-name-prefix <project>
```
Then open https://claude.ai/code (or the Claude app) on any device → pick the server → start a session. Execution stays on the host machine (its files, MCP servers, credentials); claude.ai only relays.

**Needs:** Claude Code ≥ 2.1.200 for `--spawn/--capacity/--continue` (2.1.51+ for basic Remote Control); a claude.ai login (Pro/Max/Team/Enterprise — **API keys are not supported**). Check flags with `claude remote-control --help` (it errors instead of printing help when not signed in with an eligible account).

**Verify:** the session shows in claude.ai/code with a green dot.

## Overview

Use this when long or overnight work should keep running while your laptop sleeps, and you still want to watch/steer it from the laptop or phone. Alternatives: **cloud sessions** (claude.ai/code on Anthropic infra — no local tools/licensed software), **Dispatch** (Desktop app + mobile), **scheduled tasks/routines** (recurring, not interactive).

## Server mode essentials

| Flag | Meaning |
|---|---|
| `--spawn worktree` | each remotely-started session gets its own git worktree (needs a git repo); `same-dir` (default) shares the cwd; `session` = single session |
| `--capacity N` | max concurrent sessions (default 32) |
| `--permission-mode <m>` | starting mode for spawned sessions: `auto`, `acceptEdits`, `manual`, `dontAsk`, `plan`, `bypassPermissions` |
| `--remote-control-session-name-prefix` | session name prefix (default hostname) — use the project name |
| `-c/--continue`, `--session-id` | bring back sessions after the server stopped |
| `--[no-]chrome` | Claude in Chrome for spawned sessions |

Behaviour worth designing around:
- **Server mode exits after ~10 min without network.** Wrap it in a restart loop.
- Restarting `claude remote-control` in the same directory **brings its sessions back for ~4 h**.
- First run per directory asks **workspace trust** and a one-time **"Enable Remote Control?"** — interactive only (exits with `Workspace not trusted` when stdin/stdout aren't a terminal). Run the first start in a visible window.
- Permission prompts and `AskUserQuestion` stay open until answered; other forwarded dialogs expire after 5 min (`dialogExpiry`).
- The transcript is stored on Anthropic servers while connected; only outbound HTTPS, no inbound ports.

## Unattended (overnight) setup

1. **Permission mode `auto`** — a classifier approves routine actions and blocks risky ones (it blocked an unreviewed `gh pr merge` in testing even when the user had asked). Add hard **deny rules** in `~/.claude/settings.json` `permissions.deny` for things that must never happen unattended: `Bash(gh pr merge:*)`, `Bash(git push origin main:*)`, `Bash(git push --force:*)`, `Bash(git push -f:*)`, global installs (`Bash(winget:*)`, `Bash(npm install -g:*)`, `Bash(pip install:*)`), `mcp__github__merge_pull_request`. The user can still do these via a `!` command.
2. **Phone pushes:** Claude mobile app signed in to the same account → in Claude Code `/config` enable **Push when Claude decides** and **Push when actions required**. Prompt tasks with "notify me when done".
3. **Branch + PR workflow:** tell sessions (CLAUDE.md) to work on a branch, log progress in the PR description, never merge.

## Windows specifics

- **Keep awake without changing the power plan:** from the supervising process call `SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED)` (`0x80000001`); Windows drops it automatically when the process exits. PowerShell:
  ```powershell
  Add-Type -Namespace X -Name Power -MemberDefinition '[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);'
  [void][X.Power]::SetThreadExecutionState([uint32]'0x80000001')
  ```
  Prevents idle sleep, not lid-close/manual sleep; the display can still turn off.
- **Auto-start without admin:** a `.cmd` in `[Environment]::GetFolderPath('Startup')` runs at **sign-in** (not boot — after a Windows Update reboot someone must sign in). `schtasks /SC ONLOGON` generally needs elevation.
- Run each server in its own (minimized) console window: server mode is a TUI (status, QR code on spacebar) and needs a real terminal.
- Stop a supervisor and its claude child with `taskkill /PID <pid> /T /F`. Track supervisors by PID **and** verify the command line (`Win32_Process.CommandLine`) — PIDs get recycled.

## Windows PowerShell 5.1 gotchas hit while scripting this

- `$ErrorActionPreference = 'Stop'` turns a native command's stderr output into a terminating error in 5.1 — use `Continue` and throw explicitly.
- Never name a variable `$args` (automatic variable; splatting it silently misbehaves).
- `ConvertTo-Json` of a one-element array emits an object; use `ConvertTo-Json -InputObject @($items)`.
- `Start-Process -ArgumentList` joins with spaces — embed quotes around paths: `"`"$path`""`.
- No `??`, `?.` or ternaries in 5.1.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Server exits immediately in a loop | sign-in (`claude` → `/login`), untrusted workspace, or pending one-time enable prompt — run it once visibly |
| `claude remote-control --help` errors | not signed in with an eligible claude.ai account |
| `gh repo create --source . --push` fails "check access rights" | gh's `git_protocol` is ssh without keys; repo is still created — `git remote set-url origin https://github.com/<owner>/<repo>.git` and push (or `gh config set git_protocol https`) |
| Pushes never arrive | open the mobile app to refresh its token (`/config` shows "No mobile registered"); check Focus/battery optimisation |

## Related Tools

- project-spider (7ports/project-spider): a PowerShell CLI implementing this pattern for any number of projects — `spider add <repo>`, `spider start -All`, keepalive with backoff, keep-awake, Startup-folder auto-start, guardrail installer, `spider status/logs/doctor`.

---

*Last updated: 2026-10-19*
*Setup verified on: Windows 10, Claude Code 2.1.303 (supervisor tested with a stub claude; real server first-run is interactive)*
