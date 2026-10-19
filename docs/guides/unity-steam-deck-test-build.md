---
id: unity-steam-deck-test-build
type: guide
title: Unity test builds for Steam Deck (Proton) and BuildPlayer from automation
summary: Windows x64 Unity builds run on Steam Deck via Proton; BuildPlayer must be deferred with delayCall when invoked from the editor loop; sideloading steps
tags:
  - unity
  - steam-deck
  - proton
  - build
  - BuildPipeline
  - mcp
embedding_version: 1
---

# Unity: test builds for the Steam Deck, and building from an editor-automation tool

## Which build target

The Steam Deck runs Windows builds through **Proton**, so a plain **Windows x64 (Mono)** Unity build is
the quickest route when the editor has no *Linux Build Support* module installed. Check with
`ls "<Unity Hub>/Editor/<version>/Editor/Data/PlaybackEngines"`: `windowsstandalonesupport` is
enough. A native Linux build means installing the Linux module through Unity Hub first.

Player settings that suit the Deck:
- `PlayerSettings.fullScreenMode = FullScreenWindow` (renders at the Deck's native 1280x800).
- Default screen 1280x800 (only used windowed).
- UI Toolkit `PanelSettings` scaling with screen size, matched 0.5 against 1920x1080, stays legible.
- Input System gamepad bindings work: Steam Input presents the Deck as an Xbox-style pad under Proton.

## Building from code run by an editor-automation tool (MCP "execute script" etc.)

`BuildPipeline.BuildPlayer` called from inside the editor's update loop fails at once with
`result: Unknown`, `0s`, and in Editor.log:

```
Error building Player: A player build cannot be executed while inside the player loop.
```

Fix: schedule it with `EditorApplication.delayCall += () => { var report = BuildPipeline.BuildPlayer(...); /* write a result file */ };`
and return immediately. Then poll for the result file from outside, since the build takes minutes and
the tool call would time out.

## Smoke-testing a Windows build without a window

`Game.exe -batchmode -nographics -logFile <absolute path>` runs the player headless. This checks that
assemblies load and the first scene's scripts start without exceptions. It cannot render, so UI and
gameplay still need the device. Use an absolute `-logFile` path.

## Loading onto the Deck (summary)

1. Copy the **whole** build folder (exe + `_Data` + `MonoBleedingEdge` + DLLs). Use a USB stick
   (exFAT), Warpinator/Winpinator over Wi-Fi, or `scp` after enabling sshd on the Deck (`passwd`,
   `sudo systemctl enable --now sshd`).
2. In Desktop Mode, use Steam's *Games > Add a Non-Steam Game* (set the filter to *All Files* to see
   .exe files), pick the exe, then *Properties > Compatibility*: force Proton Experimental.
3. Play from *Library > Non-Steam* in Gaming Mode.

Saves under `Application.persistentDataPath` land in the shortcut's Proton prefix:
`~/.local/share/Steam/steamapps/compatdata/<id>/pfx/drive_c/users/steamuser/AppData/LocalLow/<company>/<product>/`.
Fallbacks if it won't start: another Proton version, or the `-force-d3d11` launch option.
