---
id: itch-dl
type: guide
title: itch-dl (download itch.io games and assets from the CLI)
summary: "Install itch-dl with pip --user on Windows, find its exe off-PATH, and authenticate downloads with an itch.io API key."
tags:
  - itch.io
  - itch-dl
  - python
  - pip
  - windows
  - cli
status: verified
embedding_version: 1
---

# itch-dl (download itch.io games and assets from the CLI)

`itch-dl` is a Python CLI that bulk-downloads itch.io games, asset packs and game jams. It downloads via the itch.io API, so it needs an API key.

## Install (Windows)

```bash
python -m pip install --user itch-dl     # 1.0.0 as of 2026-10; needs Python 3.10+
```

- **The exe is NOT on PATH by default.** `--user` installs it into the per-user Scripts dir:
  ```bash
  python -c "import sysconfig;print(sysconfig.get_path('scripts','nt_user'))"
  # e.g. C:\Users\<you>\AppData\Roaming\Python\Python310\Scripts\itch-dl.exe
  ```
  Call it by full path, or add that dir to the user PATH.
- If `python3` opens the Microsoft Store or does nothing, it's the Store stub: use `python` or `py` instead.
- Check the install: `itch-dl --help`. `pip show itch-dl` gives the version (there's no `--version` flag; it prints usage).

## Authenticate

- Pass `--api-key <key>`, or keep the key in a profile (`--profile`). Get a key at https://itch.io/user/settings/api-keys.
- **Keep the key off printed command lines:** read it into a shell variable and pass `--api-key "$KEY"`.
- **A key issued by `butler login` may be scoped to uploads.** Test it with a real download before relying on it. If it fails with an auth or scope error, create a full API key in the itch.io settings.

## Usage

```bash
itch-dl --api-key "$KEY" --download-to <dir> https://<creator>.itch.io/<project>
```

Accepts a game/asset URL, a creator page, a collection, or a jam URL. To smoke-test a key, download a small free asset into a fresh temp dir and check that a file arrives.

## Related Tools

- itch-butler (uploading builds; `butler login` stores its key in the butler config folder)
