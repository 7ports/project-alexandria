---
id: itch-butler
type: guide
title: itch-butler
embedding_version: 1
---

# itch.io butler (CLI for pushing builds)

butler is itch.io's command-line tool for uploading game builds. It uploads only what changed
(`butler push`), and the itch app then patches players' installs automatically.

## Install (Windows)

- **Official download** (always current): `https://broth.itch.zone/butler/windows-amd64/LATEST/archive/default`
  - The latest version number: `curl -s https://broth.itch.zone/butler/windows-amd64/LATEST`
  - A specific version: `.../butler/windows-amd64/<version>/archive/default`
  - The zip holds `butler.exe`, `7z.dll` and `c7zip.dll`. Keep all three together.
- **Verify** with the Windows code signature, which should be signed by itch corp.:
  `Get-AuthenticodeSignature .\butler.exe` should report `Status: Valid` and
  `Signer: CN=itch corp., O=itch corp., L=San Francisco, S=California, C=US`.
  The `/signature/default` broth URL is itch's binary patch-signature format, not a checksum you can compare.

## Gotcha: an old copy bundled with the itch app

- **Where it lives:** if the itch desktop app is installed, it keeps its own butler at
  `%APPDATA%\itch\apps\butler\` and adds that folder to the **machine** PATH. A copy you install
  elsewhere on the *user* PATH won't win, because Windows searches the machine PATH first.
- **It can be years old:** if the itch app hasn't been run in a long time, this copy goes stale (one machine had 2021's v15.21.0).
  - **Old self-upgrade is broken:** `butler upgrade` in old versions fails, because it checks `broth.itch.ovh`, a domain that no longer exists.
  - **Check before replacing:** `butler -V` vs the broth LATEST number. A copy one minor version behind (v15.31.0 vs 15.32.0, 2026-10) pushed fine; it only prints an "upgrade available" banner. Replace it only when it's genuinely old.
- **Fix:** close the itch app, rename the folder (e.g. `butler-old`), make a new `butler` folder there and
  copy the new three files in. The PATH entry keeps working, and the itch app accepts the newer copy.
- **Scripts:** look for `butler` on PATH, then fall back to `%APPDATA%\itch\apps\butler\butler.exe` (Git Bash may not see the machine PATH entry).

## Authenticate

- **Interactive:** `butler login` opens the browser and saves a key in the butler config folder
  (`%APPDATA%\itch\butler_creds` on Windows).
- **CI:** set `BUTLER_API_KEY` (from itch.io > Settings > API keys) instead of logging in.
- **Check:** `butler status <user>/<game>` lists channels and versions once logged in. A new page with no uploads prints `No channel found`; that also confirms the login works.

## Push

```
butler push <build-dir> <user>/<game>:<channel> --userversion <version>
```

- **Channel name sets the platform tag:** a name containing `windows`, `linux` or `osx`/`mac` gets
  that platform; `web`/`html5`/`webgl` makes it a browser upload.
- **The game slug is what's in the page URL**, typos included (e.g. a page created as `my-gmae` stays `user/my-gmae`).
- **After a push**, `butler status user/game:channel` shows the build as processing, then `√ #<build>` once ready (under a minute for a small web build).
- **Browser games still need page settings** on the itch dashboard (butler can't set them): Kind of project = HTML, the upload ticked "This file will be played in the browser", an embed size, and visibility.
- **Testers:** keep the page **Restricted** and share a password or download keys. Testers must
  *claim* a key to their account for the itch app to see the game.

## PICO-8 web builds on itch [VERIFIED 2026-10]

- Export to a folder as `index.html` (+ `index.js`, ~1.7 MB): itch's HTML5 player loads `index.html`. Push the folder itself (no zip needed) on an `html5` channel. The first push of such a build uploaded 1.66 MiB as a ~575 KiB compressed patch; later pushes only send what changed.
- The PICO-8 side (cart label required, minify before export) is in the pico-8 guide.
- Suggested embed size: a multiple of 128 px, e.g. 512 × 512 or 640 × 640; the default PICO-8 player page adds its own controls around the canvas.

## Unity WebGL on itch

- **Limits:** 500 MB unzipped, 1,000 files, 200 MB per file.
- **Compression:** Gzip is detected automatically. Brotli only works with `.br` file names and
  Decompression Fallback off.
