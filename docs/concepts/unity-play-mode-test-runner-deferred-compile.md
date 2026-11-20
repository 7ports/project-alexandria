---
id: unity-play-mode-test-runner-deferred-compile
type: concept
title: "Unity: unattended play-mode test runs that survive code edits"
summary: "Run play-mode checks from an editor runner that writes result files; defer script recompiles during the run; isCompiling stays true while a deferred compile is pending, and MCP bridges can block on it."
tags:
  - unity
  - testing
  - play-mode
  - editor-scripting
  - gotcha
  - mcp
embedding_version: 1
---

# Unattended Unity play-mode test runs that survive code edits

**Pattern:** an `[InitializeOnLoad]` editor runner:

1. Keeps its state in `SessionState`, which survives the domain reload on entering play mode.
2. Enters play mode and runs each suite.
3. Writes `<suite>.result.txt` per suite and `done.txt` at the end, under `Library/`. Each file is written to a temp name and then renamed.

An agent or CI then waits on the files with a short local poll or watcher, rather than a fixed sleep.

**Editing code during a run:** set EditorPrefs `ScriptCompilationDuringPlay` to `1` ("Recompile After Finished Playing") for the run. Restore the user's value only after `PlayModeStateChange.EnteredEditMode`, then call `AssetDatabase.Refresh()`.
- Saved script edits no longer trigger a domain reload that destroys the running suite.
- They compile when play mode ends.
- On Windows the pref is stored in the registry as `ScriptCompilationDuringPlay_h<hash>` under `HKCU\Software\Unity Technologies\Unity Editor 5.x`.

**Gotchas:**
- **`EditorApplication.isCompiling` stays true for the whole time a deferred compile is pending in play mode.** A runner that skips its update while `isCompiling` stalls forever. Gate on compilation only before entering play mode.
- Editor-bridge MCP tools (e.g. Coplay `execute_script`, `stop_game`, `get_unity_logs`) can block and time out while that compile is pending. A lightweight state query may still answer. The runner must finish and exit play mode on its own; don't depend on the bridge mid-run.
- A tool call that sets `EditorApplication.isPlaying = true` can be interrupted by the play-mode domain reload and retried by the bridge. Make the start call idempotent: if a run is active, report "in progress" rather than an error.
- Forcing `AssetDatabase.Refresh()` in play mode causes a frame hitch. Checks with narrow timing windows (e.g. an attack's active frames) can then fail spuriously. Let Unity notice file changes itself.
- Handle `ExitingPlayMode` while a run is active, and a static-constructor reload mid-suite, by writing an ABORTED result. Otherwise the listener waits out its timeout.
- `Editor.log` (`%LOCALAPPDATA%\Unity\Editor\Editor.log` on Windows) stays readable while the bridge is blocked. Grep it for `Requested script compilation` and `Reloading assemblies`.
