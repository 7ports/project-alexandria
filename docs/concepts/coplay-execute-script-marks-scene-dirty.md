---
id: coplay-execute-script-marks-scene-dirty
type: concept
title: Coplay MCP execute_script marks the active Unity scene dirty after every call
summary: "Coplay's execute_script calls MarkSceneDirty on the active scene after each script, so Scene.isDirty is meaningless in Coplay-driven workflows; compare a saveAsCopy with the file on disk instead. It also makes TestRunnerApi edit-mode runs block on the 'Scene(s) Have Been Modified' dialog; delay the run past the call and reload the scene when it matches disk."
tags:
  - unity
  - coplay
  - mcp
  - editor-automation
  - test-runner
  - scene-dirty
  - modal-dialog
embedding_version: 1
---

# Coplay `execute_script` marks the active scene dirty

The Coplay MCP bridge's `execute_script` calls `EditorSceneManager.MarkSceneDirty` on the active scene after every script it runs, including read-only ones. Stack trace: `Coplay.MCP.ScriptExecutor.ExecuteScriptFromFileAsync`, then `Coplay.Common.Utils.SafeMarkSceneDirty`. It was confirmed by hooking `EditorSceneManager.sceneDirtied` and logging `Environment.StackTrace`.

**Consequences:**
- `Scene.isDirty` is almost always true in a Coplay-driven session, so it cannot tell real unsaved work from noise. A script that checks `isDirty` sees `false`, and the next call finds it `true`: the flag is set after the script returns.
- A guard like "refuse if the scene has unsaved changes" blocks every time, because the call that starts the check flags the scene first.
- `EditorSceneManager.SaveOpenScenes()` in tooling saves whichever scene happens to be open. If a component gained serialized fields since the scene was last saved, Unity writes those fields out, and a scene someone wanted left untouched quietly changes.
- **Test Runner hangs:** starting an Edit Mode run with `TestRunnerApi.Execute` from `execute_script` makes the Test Runner show the modal **"Scene(s) Have Been Modified" (Save / Don't Save / Cancel)** because of the spurious flag. The Editor freezes, every bridge call times out, and the results callback never fires until a human clicks a button.

**Reliable check for real unsaved changes:** save a copy and compare it with the file on disk.

```csharp
static bool HasUnsavedChanges(Scene scene)
{
    if (!scene.isDirty) return false;
    if (string.IsNullOrEmpty(scene.path) || !File.Exists(scene.path)) return true;
    string copy = Path.Combine(Path.GetTempPath(), "scene_check.unity");
    try
    {
        if (!EditorSceneManager.SaveScene(scene, copy, saveAsCopy: true)) return true;
        return !File.ReadAllBytes(copy).SequenceEqual(File.ReadAllBytes(scene.path));
    }
    finally { if (File.Exists(copy)) File.Delete(copy); }
}
```

`saveAsCopy: true` leaves the scene's path and dirty state alone. Normalise `\r\n` to `\n` before comparing if the repo uses autocrlf.

**Unattended Edit Mode test runs (fix for the hang):**
1. From the bridge call, only *schedule* the run. Hook `EditorApplication.update` and start about 1 s later (`EditorApplication.timeSinceStartup`), so the bridge has already set its dirty flag. `delayCall` is unreliable when the Editor is idle in the background.
2. When the run starts, if the single open scene is dirty but `HasUnsavedChanges` says it matches disk, reopen it with `EditorSceneManager.OpenScene(path, OpenSceneMode.Single)`. That clears the flag and loses nothing.
3. If there are real unsaved changes, or several or untitled scenes are open, don't touch anything. Write "skipped: reason" to the results file instead of running.
4. Call `TestRunnerApi.Execute` and write results to a file from `ICallbacks.RunFinished`. Poll for the file from outside.

**If a dialog is already blocking:** from outside the Editor, use Win32 `EnumWindows` to find the window titled `Scene(s) Have Been Modified`. `EnumChildWindows` lists its `Button` children, and `SendMessage(button, BM_CLICK=0x00F5)` presses one; **Cancel** is the safe choice because it changes nothing. The same enumeration, run from a background watcher during the call, is a cheap way to find out which modal is blocking an automated Editor.

**Diagnosing "who dirtied this scene?" in general:** add a temporary `[InitializeOnLoad]` class that subscribes to `EditorSceneManager.sceneDirtied` and `Debug.Log`s the scene path with `System.Environment.StackTrace`. Then read the trace from `Editor.log`.
