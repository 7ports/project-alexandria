---
id: unity-automation-modal-dialogs
type: concept
title: "Unity editor automation: modal dialogs, background-idle editor, and paused tests"
summary: "What stalls Unity automation (open-scene git restores, dirty scenes, BuildPlayer in the loop, background editor not ticking delayCall, paused tests) and the fix for each"
tags:
  - unity
  - automation
  - mcp
  - build
  - delayCall
  - dialogs
  - input-system
embedding_version: 1
---

# Unity editor automation: avoiding modal dialogs that block everything

When an agent drives the Unity Editor through a bridge (an MCP "execute script" tool, editor scripts,
etc.), a modal dialog blocks the editor's main thread. Every later call times out, and builds or test
runs in progress stall until a person clicks it. Scripts cannot answer these dialogs, and clicking them
through OS-level UI automation is blind and risky (it might press "Don't Save"). The fix is to never
trigger them.

## What triggers them, and what to do instead

| Trigger | Do instead |
| --- | --- |
| `git checkout`/`git restore` of a `.unity` scene that is open in the editor ("modified externally, reload?") | Leave the working copy alone and exclude the file from commits with a pathspec (`git add -A -- . ':!Assets/Scenes/Test.unity'`). |
| Editing an open scene's YAML on disk | Change scenes through an editor script, or only edit the YAML when the scene is certainly closed. |
| Starting a player build while scenes are dirty (some flows ask to save) | `EditorSceneManager.SaveOpenScenes()` and `AssetDatabase.SaveAssets()` first. Refuse to build when `EditorApplication.isPlaying`, `isCompiling` or `isUpdating`. |
| `BuildPipeline.BuildPlayer` from inside the editor loop | It fails at once ("cannot be executed while inside the player loop"). Queue it, see below, and write the result to a file to poll. |

## A queued build waits until someone clicks on Unity

`EditorApplication.delayCall` runs on the editor's next update. An editor window **in the
background** (not focused) barely updates, even with Preferences > General > Interaction Mode set to
"No Throttling". So a build queued with `delayCall` from an automation call can sit for many minutes,
then start the moment a person focuses Unity. It looks like the person's click "fixed" it.

The fix is to queue it and also wake the editor:

```csharp
static Action _pending;
public static void Run(Action work)
{
    bool waiting = _pending != null;
    _pending = work;
    if (waiting) return;
    EditorApplication.update += Tick;
    EditorApplication.QueuePlayerLoopUpdate();            // ask for an update
    UnityEditorInternal.InternalEditorUtility.RepaintAllViews();
}
static void Tick()
{
    var work = _pending; _pending = null;
    EditorApplication.update -= Tick;
    work?.Invoke();
}
```

With this, a queued build-and-upload started within seconds with Unity in the background.

Two more things to know:
- **A script reload discards queued work:** a domain reload (any script change) clears pending
  `delayCall`/`update` handlers. That's useful for cancelling stale queued jobs, but don't queue work
  and then edit scripts.
- **Gamepad tests also depend on focus:** by default the Input System drops gamepad input for an
  unfocused game. For tests, set `InputSystem.settings.backgroundBehavior = IgnoreFocus` and
  `editorInputBehaviorInPlayMode = AllDeviceInputAlwaysGoesToGameView`, and restore them afterwards.

## A paused play-mode test also hangs

A play-mode test that pauses the game (`Time.timeScale = 0`) and fails before unpausing hangs a runner
that waits with `WaitForSeconds` (scaled time). Unpause in a `finally`, and wait in real time
(`WaitForSecondsRealtime`) where it matters.

## Diagnosing

- **Calls time out and the log has been idle for minutes:** `%LOCALAPPDATA%/Unity/Editor/Editor.log`
  hasn't changed, so the main thread is blocked. Suspect a dialog and ask the person at the machine.
- **Calls answer but queued work never starts:** the editor is idle in the background. Wake it, as
  above.
