---
id: itch-dl
type: guide
title: itch-dl (download itch.io games and assets from the CLI)
summary: "Install itch-dl with pip --user on Windows, find its exe off-PATH, authenticate with a full itch.io API key (butler's key is rejected), and what a download contains (files/, metadata.json, site.html with free-text licence)."
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

- Pass `--api-key <key>`, or keep the key in a profile (`--profile`). **Create a full key at https://itch.io/user/settings/api-keys.**
- **butler's key does not work (verified 2026-10):** the key `butler login` saves in `~/.config/itch/butler_creds` is rejected by `api.itch.io/profile`, which itch-dl checks before every run. Don't bother wiring it up.
- **Validate a key the way itch-dl does:** `GET https://api.itch.io/profile?api_key=<key>` returns `{"user": {...}}` for a usable key. A setup script can check this before saving the key.
- **Keep the key off printed command lines and logs:** read it into a variable, pass `--api-key "$KEY"`, and scrub it from any captured output before saving it.
- **Claude Code auto mode blocks agents from reading credential files** (e.g. `butler_creds`) as "credential exploration", even when the request was relayed from the user by another session. Moving a key into place is a step for the user: ship a small script they run themselves (one short command; long pasted one-liners tend to break when copied from a terminal), or have them ask in their own words in the session that will do it.

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

- itch-butler (uploading builds; its saved key is upload-only for this purpose)
- A Claude Code skill built on this (fetch-assets) quarantines downloads, unpacks archives with traversal/link checks, writes a SOURCE.md with the licence text, and ships a set-key script the user runs once per machine.
