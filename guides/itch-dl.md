---
id: itch-dl
type: guide
title: itch-dl (download itch.io games and assets from the CLI)
summary: "Install itch-dl with pip --user on Windows, find its exe off-PATH, authenticate with an itch.io API key, and what a download contains (files/, metadata.json, site.html with free-text licence)."
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

`itch-dl` is a Python CLI that bulk-downloads itch.io games, asset packs and game jams. It downloads via the itch.io API, so it needs an API key. It only fetches free items or items in your library; it does not bypass paywalls.

## Install (Windows)

```bash
python -m pip install --user itch-dl     # 1.0.0 as of 2026-10; needs Python 3.10+
```

- **The exe is NOT on PATH by default.** `--user` installs it into the per-user Scripts dir:
  ```bash
  python -c "import sysconfig;print(sysconfig.get_path('scripts','nt_user'))"
  # e.g. C:\Users\<you>\AppData\Roaming\Python\Python3xx\Scripts\itch-dl.exe
  ```
  Call it by full path (scripts can resolve it with `shutil.which('itch-dl')` falling back to that dir), or add the dir to the user PATH.
- If `python3` opens the Microsoft Store or does nothing, it's the Store stub: use `python` or `py` instead.
- Check the install: `itch-dl --help`. `pip show itch-dl` gives the version (there's no `--version` flag; it prints usage).

## Authenticate

- Pass `--api-key <key>`, or keep the key in a profile (`--profile`). Get a key at https://itch.io/user/settings/api-keys.
- **Keep the key off printed command lines and logs:** read it into a variable, pass `--api-key "$KEY"`, and scrub it from any captured output before saving it.
- **A key issued by `butler login` may be scoped to uploads.** Test it with a real download before relying on it. If it fails with an auth or scope error, create a full API key in the itch.io settings.
- **Claude Code auto mode blocks agents from reading credential files** (e.g. butler's `butler_creds`) as "credential exploration", even when the user asked for the key to be found. Moving a key into place is a step for the user to run themselves (e.g. a `!` command), not one to route through another session.

## Usage

```bash
itch-dl --api-key "$KEY" --download-to <dir> https://<creator>.itch.io/<project>
```

Accepts a game/asset URL, a creator page, a collection, or a jam URL. To smoke-test a key, download a small free asset into a fresh temp dir and check that a file arrives.

## What a download contains

```
<dir>/<creator>/<project>/
  files/          the uploads (often a .zip to unpack)
  metadata.json   title, url, author, author_url, description, cover_url, screenshots,
                  extra{status, category, tags, ai_content_tags}, errors[], external_downloads[]
  site.html       the project page
  cover.png       (and screenshots when present)
```

- **The licence is NOT in metadata.json.** itch.io has no structured licence field for most pages; creators write it in the description. Extract it from `site.html`: strip `<script>/<style>`, turn tags into line breaks, and keep lines matching licence/credit/commercial/redistribute/CC0/Creative Commons plus the few lines after a "License" heading.
- `external_downloads` lists off-site links (Google Drive, Dropbox…) that itch-dl reports but does not fetch.
- An empty `files/` usually means a paid item that isn't in your library.
- Text in metadata/site is UTF-8 with emoji: in Python on Windows use `-X utf8` (note `-I` ignores `PYTHONIOENCODING`).

## Related Tools

- itch-butler (uploading builds; `butler login` stores its key in the butler config folder)
- A Claude Code skill built on this (fetch-assets) quarantines downloads, unpacks archives with traversal/link checks and writes a SOURCE.md with the licence text.
