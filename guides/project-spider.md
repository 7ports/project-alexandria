---
id: project-spider
type: guide
title: "project-spider: always-on Claude Code Remote Control servers on Windows"
summary: "Install and setup notes for project-spider, a PowerShell supervisor that keeps one `claude remote-control --spawn worktree` server per project running on an always-on Windows PC."
tags:
  - claude-code
  - remote-control
  - windows
  - powershell
status: verified
embedding_version: 1
---

# project-spider

A Windows PowerShell 5.1 supervisor that keeps one `claude remote-control --spawn worktree` server
per registered project running on an always-on Windows PC. You reach the servers from
claude.ai/code or the Claude app. The repo is private (`gh repo clone <owner>/project-spider`).

## Setup
```powershell
.\spider.cmd install        # asks: user PATH, Startup-folder auto-start
spider add <path|owner/repo> # owner/repo clones into %USERPROFILE%\spider-projects by default
spider start <name> -Visible # one-time trust / enable-Remote-Control prompts; then minimize
spider doctor
```
Once per machine, in `claude` → `/config`, turn on **Push when Claude decides** and **Push when actions required**.
This needs the Claude phone app signed in to the same account.

Unattended sessions run in Claude Code's `auto` permission mode. Since 2026-10-19 spider relies on
auto mode's safety classifier alone; earlier versions also offered user-level deny rules, which was
a problem when `~/.claude/settings.json` is synced across machines.

## Gotchas
- **Non-interactive install:** `install -Yes` accepts every step. To choose step by step without a
  console, pipe the answers: `printf 'y\nn\n' | ./spider.cmd install` (Read-Host reads the
  redirected stdin).
- **Older versions nested projects.json** after a second `spider add`
  (`{"value": [...], "Count": n}`), so projects disappeared from `list` and auto-start, and
  `status -Prs` always showed 1. Cause: see the reference
  `powershell-51-convertfrom-json-array-nesting`. Current versions read a nested registry back
  and save it flat. On an old version, flatten `%LOCALAPPDATA%\project-spider\projects.json` into a
  plain list by hand.
- `PATH` changes only reach new terminals. Until then, run `.\spider.cmd` from the clone.
- Remote Control needs a claude.ai sign-in (no API keys). If a server keeps restarting, run
  `spider restart <name> -Visible` and check whether it's asking you to log in.
