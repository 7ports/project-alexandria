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
- **Fix:** close the itch app, rename the folder (e.g. `butler-old`), make a new `butler` folder there and
  copy the new three files in. The PATH entry keeps working, and the itch app accepts the newer copy.

## Authenticate

- **Interactive:** `butler login` opens the browser and saves a key in the butler config folder
  (`%APPDATA%\itch\butler_creds` on Windows).
- **CI:** set `BUTLER_API_KEY` (from itch.io > Settings > API keys) instead of logging in.
- **Check:** `butler status <user>/<game>` lists channels and versions once logged in.

## Push

```
butler push <build-dir> <user>/<game>:<channel> --userversion <version>
```

- **Channel name sets the platform tag:** a name containing `windows`, `linux` or `osx`/`mac` gets
  that platform; `web`/`html5`/`webgl` makes it a browser upload.
- **Testers:** keep the page **Restricted** and share a password or download keys. Testers must
  *claim* a key to their account for the itch app to see the game.

## Unity WebGL on itch

- **Limits:** 500 MB unzipped, 1,000 files, 200 MB per file.
- **Compression:** Gzip is detected automatically. Brotli only works with `.br` file names and
  Decompression Fallback off.
