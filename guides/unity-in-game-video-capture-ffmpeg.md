---
id: unity-in-game-video-capture-ffmpeg
type: guide
title: "Unity in-game video capture to ffmpeg, a gamepad bot, and capturing old commits"
summary: captureFramerate + AsyncGPUReadback piped to ffmpeg for smooth unattended capture in built players; row-order and NVENC gotchas; a virtual-gamepad bot that works across commits; worktree-based old-commit builds; ffmpeg recipes for social assets
tags:
  - unity
  - ffmpeg
  - capture
  - video
  - input-system
  - git-worktree
  - promo
embedding_version: 1
---

# Unity: in-game video capture piped to ffmpeg, and capturing old commits

How to record smooth promo or gameplay video from any Unity build, unattended, without screen
recording. It works in built players, unlike Unity Recorder, which is editor-only and doesn't run in
`-batchmode`.

## Capture loop

1. Set `Time.captureFramerate = fps`. Every frame then advances exactly 1/fps of game time however
   long it takes to render, so the output is smooth on any machine.
2. Each frame: `yield return new WaitForEndOfFrame()`, then
   `ScreenCapture.CaptureScreenshotIntoRenderTexture(rt)`, then
   `AsyncGPUReadback.Request(rt, 0, TextureFormat.RGBA32, callback)`.
3. In the callback, copy `request.GetData<byte>()` into a reused `byte[]` and write it to ffmpeg's
   stdin. The callbacks arrive in request order.
4. Start ffmpeg as a `System.Diagnostics.Process` with stdin and stderr redirected (read stderr
   asynchronously or it deadlocks):
   `ffmpeg -f rawvideo -pix_fmt rgba -s WxH -r FPS -i - -c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p -movflags +faststart out.mp4`
   - Use even sizes, which yuv420p needs.
5. At the end: `AsyncGPUReadback.WaitAllRequests()`, close stdin, `WaitForExit`, and set
   `Time.captureFramerate = 0`.

Nothing is stored between frames, which matters because raw PNG sequences are about 15–20 GB per
minute at 1080p. One measurement: 60 s of 1080p60 took about 50 s to capture with libx264, on a
desktop GPU and CPU.

## Gotchas

- **Row order is opposite for video and PNG.** On Direct3D, Vulkan and Metal
  (`SystemInfo.graphicsUVStartsAtTop == true`) the readback comes out **top row first**.
  - That is exactly what ffmpeg rawvideo expects, so **don't** add `-vf vflip`.
  - `ImageConversion.EncodeArrayToPNG` expects **bottom row first**, so flip the rows for stills.
  - On OpenGL it's the other way round. Getting this wrong gives upside-down video and correct
    stills, or the reverse.
- **NVENC driver requirement:** ffmpeg 9.x's `h264_nvenc` needs NVIDIA driver 610 or newer ("Driver
  does not support the required nvenc API version. Required: 13.1"). Default to libx264 and make
  the hardware encoders optional.
- **An unfocused player can drop input:** set `InputSystem.settings.backgroundBehavior = IgnoreFocus`
  and `Application.runInBackground = true`. Disable the real Mouse and Keyboard if a bot drives a
  virtual Gamepad, so stray desktop input can't interfere.
- **UI Toolkit ignores navigation in an unfocused editor window,** whatever the Input System
  settings. Load the game scene directly rather than navigating menus.

## A bot that plays any commit

- Drive a virtual gamepad: `InputSystem.AddDevice<Gamepad>()` plus
  `InputSystem.QueueStateEvent(pad, new GamepadState { leftStick, rightStick }.WithButton(...))` every
  frame.
  - The game's own PlayerInput auto-switches to it.
  - Gamepad bindings change far less over a project's history than code does.
- Find game objects by type **name** at runtime (search `AppDomain` assemblies for a type with that
  short name, then `Object.FindObjectsByType(type, ...)`) and read members by reflection. The rig
  then compiles into old commits whose APIs differ.
- **Closed-loop camera control:** right stick proportional to the yaw and pitch error between the
  camera's forward and the target, clamped. Clamp the target pitch (e.g. -20° to 25°) or the camera
  ends up staring at the ceiling.
- **Give up on unreachable targets:** if the distance hasn't improved by 1 m in 3 s, ignore that
  target for a while.

## Building old commits unattended

- **One reused git worktree on a big drive**, stepped through the commits newest to oldest, keeps
  Unity's `Library` warm.
  - Seed its Library once by copying the main project's.
  - `GIT_LFS_SKIP_SMUDGE=1 git checkout -f --detach <sha>`, then `git lfs pull`, then `git clean -fd`
    (ignored files such as Library stay).
- **Inject the capture code as a local UPM package:** edit the checkout's `Packages/manifest.json`
  to add `"com.x.rig": "file:C:/abs/path/rig"`. Drop editor-only packages pinned to moving branches,
  which may no longer resolve.
- **Build:** `Unity.exe -batchmode -quit -projectPath <checkout> -buildTarget Win64 -executeMethod Rig.Build`.
  Building in batch mode is fine; only Unity Recorder needs the interactive editor. Close the main
  editor first.
- **Speed:** with a warm Library, each commit took about 35 s to build. 12 commits built and
  captured in about 16 minutes.

## Turning captures into social media assets (ffmpeg)

- **Vertical 9:16 with a blurred fill:**
  `[0:v]split[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=20:2[b];[fg]scale=1080:-2[f];[b][f]overlay=(W-w)/2:(H-h)/2`
- **GIF:** `fps=15,scale=540:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`
- **Captions:** `drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='...'`. Escape the colon in
  the Windows drive and any `:` in the text.
- **Tiles and montages:** `xstack` for a grid of stills, and `concat` filter with per-segment
  `fade` for a montage.
- **Highlights:** cut around clusters of logged events (e.g. kills within 3 s), scored by size.
  This beats motion and scene-cut detection for game footage.
