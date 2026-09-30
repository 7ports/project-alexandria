---
id: coplay-execute-script-marks-scene-dirty
type: concept
title: Coplay MCP execute_script marks the active Unity scene dirty after every call
summary: "Coplay's execute_script calls MarkSceneDirty on the active scene after each script, so Scene.isDirty is meaningless in Coplay-driven workflows; compare a saveAsCopy with the file on disk instead, and never SaveOpenScenes from tooling."
tags:
  - unity
  - coplay
  - mcp
  - editor-scripting
  - gotcha
embedding_version: 1
---

# Coplay `execute_script` marks the active scene dirty

The Coplay MCP bridge's `execute_script` calls `EditorSceneManager.MarkSceneDirty` on the active scene after every script it runs, including read-only ones. Stack trace: `Coplay.MCP.ScriptExecutor.ExecuteScriptFromFileAsync`, then `Coplay.Common.Utils.SafeMarkSceneDirty`. It was confirmed by hooking `EditorSceneManager.sceneDirtied` and logging `Environment.StackTrace`.

**Consequences:**
- `Scene.isDirty` is almost always true in a Coplay-driven session, so it cannot tell real unsaved work from noise.
- A guard like "refuse if the scene has unsaved changes" blocks every time, because the call that starts the check flags the scene first.
- `EditorSceneManager.SaveOpenScenes()` in tooling saves whichever scene happens to be open. If a component gained serialized fields since the scene was last saved, Unity writes those fields out, and a scene someone wanted left untouched quietly changes.

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

`saveAsCopy: true` leaves the scene's path and dirty state alone.

**Diagnosing "who dirtied this scene?" in general:** add a temporary `[InitializeOnLoad]` class that subscribes to `EditorSceneManager.sceneDirtied` and `Debug.Log`s the scene path with `System.Environment.StackTrace`. Then read the trace from `Editor.log`.
