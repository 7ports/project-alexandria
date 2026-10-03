---
id: unity-automation-modal-dialogs
type: concept
title: "Unity editor automation: modal dialogs that block bridges, builds and tests"
summary: "External edits/git restores of open scenes, unsaved scenes before builds, and paused play-mode tests stall Unity automation; how to avoid each"
tags:
  - unity
  - automation
  - mcp
  - build
  - git
  - dialogs
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
| `BuildPipeline.BuildPlayer` from inside the editor loop | It fails at once ("cannot be executed while inside the player loop"). Queue it with `EditorApplication.delayCall` and write the result to a file to poll. |

## Related hang that looks the same

A play-mode test that pauses the game (`Time.timeScale = 0`) and fails before unpausing hangs a runner
that waits with `WaitForSeconds` (scaled time). Unpause in a `finally`, and wait in real time
(`WaitForSecondsRealtime`) where it matters.

## Diagnosing

Bridge calls time out, and the editor log (`%LOCALAPPDATA%/Unity/Editor/Editor.log`) hasn't changed for
minutes, so the main thread is blocked. Suspect a dialog and ask the person at the machine.
