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
.\spider.cmd install        # asks: user PATH, Startup-folder auto-start, guardrail deny rules
spider add <path|owner/repo> # owner/repo clones into %USERPROFILE%\spider-projects by default
spider start <name> -Visible # one-time trust / enable-Remote-Control prompts; then minimize
spider doctor
```
Once per machine, in `claude` → `/config`, turn on **Push when Claude decides** and **Push when actions required**.
This needs the Claude phone app signed in to the same account.

## Gotchas
- **Non-interactive install:** `install -Yes` accepts every step. To choose step by step without a
  console, pipe the answers: `printf 'y\ny\nn\n' | ./spider.cmd install` (Read-Host reads the
  redirected stdin).
- **Guardrails go into the user-level `~/.claude/settings.json`.** If that file is synced across
  machines (dotfiles / git), the deny rules (winget, `npm -g`, pip, push to main, …) apply to
  every machine, which can break agent-driven setup elsewhere. Decide on scope first. Managed settings
  are machine-local; skipping them leaves auto mode's classifier as the guard. The installer also
  rewrites the file with PS 5.1 `ConvertTo-Json`, which reformats it and adds a BOM.
- **Early versions nested projects.json** after the second `spider add`
  (`{"value": [...], "Count": 1}`), so the first project disappeared from `list` and auto-start. Cause and
  fix: see the reference `powershell-51-convertfrom-json-array-nesting`. To repair an affected
  registry, flatten `%LOCALAPPDATA%\project-spider\projects.json` into a plain list.
- `PATH` changes only reach new terminals. Until then, run `.\spider.cmd` from the clone.
- Remote Control needs a claude.ai sign-in (no API keys). If a server keeps restarting, run
  `spider restart <name> -Visible` and check whether it's asking you to log in.
