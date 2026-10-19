---
id: ffmpeg-gifski-windows
type: guide
title: ffmpeg-gifski-windows
embedding_version: 1
---

# ffmpeg and gifski on Windows

## ffmpeg

- **Install:** run `winget install --id Gyan.FFmpeg --exact --silent --accept-package-agreements --accept-source-agreements`
  **from PowerShell**. winget fails with "Permission denied" from Git Bash, because the WindowsApps
  alias can't run there.
  - Gyan's "full" build (9.0.2 as of 2026-10) has `libx264`, NVIDIA `h264_nvenc`/`hevc_nvenc`/`av1_nvenc`,
    AMD `*_amf` and Intel `*_qsv` encoders, plus `ddagrab` desktop capture.
  - It installs to `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_...\ffmpeg-<ver>-full_build\bin`
    and adds that folder to the **user** PATH.
- **PATH gotcha:** shells and processes that were already running (including an agent's shell or an
  open Unity editor) don't see a new PATH entry. Call the exe by its full path until they restart.
- **winget may still ask for admin rights:** a UAC prompt appears for some packages, and an
  unattended install sits waiting until someone answers it.

## gifski: winget installs the GUI app, not the command-line tool

- `winget install ImageOptim.gifski` installs the **desktop app** into `C:\Program Files\gifski\gifski.exe`.
  Running `gifski.exe --version` opens a window (it logs `Asset favicon.ico not found`) instead of
  printing a version, and blocks a script until the window is closed.
- **Command-line tool instead:** take the CLI zip from the gif.ski release on GitHub
  (`ImageOptim/gifski` releases), or install it with `cargo install gifski`.
- **Or skip gifski:** ffmpeg's two-pass palette makes good GIFs without it:

```
ffmpeg -i in.mp4 -vf "fps=20,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5" out.gif
```
