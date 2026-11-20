---
id: unity-batchmode-saveopenscenes-untitled
type: reference
title: "Unity batch mode: SaveOpenScenes cancels on untitled scene"
summary: Headless -executeMethod builds exit 0 but build nothing when the script calls SaveOpenScenes; open a saved scene first and exit with EditorApplication.Exit.
tags:
  - unity
  - batchmode
  - build
  - ci
  - gotcha
embedding_version: 1
---

# Unity batch mode: SaveOpenScenes on the untitled startup scene cancels silently

**Symptom:** a build method run with `Unity.exe -batchmode -quit -executeMethod <Ns.Class.Method>` exits with code 0, but no new player is built. The log contains `Cancelling FileDialog: Save Scene` with a stack trace pointing at `EditorSceneManager.SaveOpenScenes()`.

**Cause:** batch mode starts on an untitled, unsaved scene. `SaveOpenScenes()` needs a path for it, tries to open a Save dialog, which batch mode cancels, and the call returns false. A build script that does `if (!SaveOpenScenes()) return "Not built";` then returns quietly, and `-quit` exits 0.

**Fix:** use a small batch-mode wrapper method that:
1. opens a real saved scene first: `EditorSceneManager.OpenScene("Assets/Scenes/<Scene>.unity", OpenSceneMode.Single)`
2. calls the build method
3. calls `EditorApplication.Exit(succeeded ? 0 : 1)` itself, so you don't need `-quit` and the exit code is meaningful

Alternatively, have the build script only save scenes that are dirty and have a path.

**Verify:** don't trust the exit code alone. Check that the build output's timestamp or version stamp changed, or grep the log for the BuildReport result.

Seen with Unity 6000.4 on Windows.
