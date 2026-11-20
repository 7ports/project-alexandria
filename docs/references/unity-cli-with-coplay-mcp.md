---
id: unity-cli-with-coplay-mcp
type: reference
title: "Unity CLI 1.0 with an MCP bridge (Coplay): setup gotchas and routing"
summary: "Windows install/PATH gotcha, Pipeline package requirement, what the unity CLI does better than an MCP bridge (status, dialogs, recompile, headless runs) and what to leave to the bridge."
tags:
  - unity
  - unity-cli
  - coplay
  - mcp
  - windows
  - agents
source_urls:
  - "https://unity.com/the-unity-cli-1.0-is-here"
  - "https://unity.com/resources/unity-pipeline-cli-technical-walkthrough"
embedding_version: 1
---

# Unity CLI (`unity`, 1.0) alongside Coplay MCP: gotchas and routing

Unity's official CLI reached 1.0 on 2026-11-17. It drives Editors from a shell, with JSON output and typed exit codes. Its live-Editor half (`unity command`, `script eval`, `recompile`, captures, the console, dialogs) needs the project's **Pipeline package** (`com.unity.pipeline`, Unity 6.0+). Without that package, `unity status` reports `STATUS_NO_INSTANCES` even while an Editor is running.

## Setup gotchas (Windows, CLI 1.0.0)
- The installer put `unity.exe` in `%LOCALAPPDATA%\Unity\bin\`, but on neither the user nor the machine PATH. From Git Bash, call it as `"$LOCALAPPDATA/Unity/bin/unity.exe"`.
- In scripts, set `UNITY_NO_BANNER=1 UNITY_NO_PAGER=1` and use `--json`. Each agent shell call is a new process, so prefix the env vars on every call, or pass `--project-path`.
- `unity skill show [--path references/<f>.md]` prints Unity's own agent skill, with a large reference, without installing anything. `unity skill install claude-code` installs it.
- `unity pipeline install` edits `Packages/manifest.json`. An Editor that is already open loads the package on its next refresh, usually when its window is focused. Until then the status is `STATUS_PIPELINE_LOAD_PENDING`.
- `unity docs --url/--content Class.Member` returns version-matched docs. An unpublished minor version (e.g. 6000.4) falls back to the nearest one (6000.3), with a warning.
- The CLI sends an anonymous usage ping. `DO_NOT_TRACK=1` or `UNITY_NO_CLI_INVOKED_TELEMETRY=1` stops it.

## Where the CLI beats an MCP bridge
- **Status that doesn't hang:** `unity status` reads the Editor log, so it reports Safe Mode and its compile errors even when no bridge can connect.
- **Modal dialogs:** `unity command editor dialog` / `... answer <id> <button>` answer them off the main thread. A dialog is a common silent cause of every MCP call timing out.
- **Compile check:** `unity recompile --json` exits 0 when the code compiles, 6 on compile errors, and 12 when no Editor is reachable.
- **Headless runs:** `unity run P --command <CliCommand>` reuses an Editor already open on the project. With `unity run P -- -executeMethod X`, don't pass `-batchmode`, `-quit` or `-projectPath`; they are rejected.
- **`unity test`:** it starts its own batch Editor, so it refuses a project that is already open. Reports go outside the repo.
- **Play-mode verification:** unfocused Editors stall at frame 1 unless you run `unity command editor set_auto_tick` first. A `--source screen` capture on a locked desktop is solid cyan, so use `--source camera` there.

## Where the MCP bridge (Coplay) still fits
- Dedicated tools for scenes, prefabs, UI, animators and input actions.
- AI asset generation.
- Existing workflows started through `execute_script` with a C# file and method. Note that it marks the active scene dirty on every call.

## Never, without the user
- `unity close` (it exits without saving).
- `console clear` (it wipes the user's console).
- Stopping a play session you didn't start.
- `unity bug` (it uploads logs).
- `self-update`.
- Plugin installs that carry a EULA.
