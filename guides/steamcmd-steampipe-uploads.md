---
id: steamcmd-steampipe-uploads
type: guide
title: steamcmd-steampipe-uploads
embedding_version: 1
---

# steamcmd — uploading game builds to Steam (SteamPipe) on Windows

## Install (Windows, no installer)

**Download and unpack** (works from Git Bash):

```bash
mkdir -p /c/steam/builder
curl -sSL -o /c/steam/steamcmd.zip https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip
unzip -o -q /c/steam/steamcmd.zip -d /c/steam/builder
```

- **Keep it outside any repo.** steamcmd writes `config/config.vdf`, which holds the login token.
- **Bootstrap it once, non-interactively:** run `./steamcmd.exe +quit`. The first run downloads about
  20 updates ("Installing update..." lines, then "Update complete, launching...") and exits 0.
- **Check it:** a second `+quit` prints `Loading Steam API...OK` and "Verifying installation...".
  Logs go to `<install>/logs/`.
- **Versions:** it updates itself on every launch; there's nothing to pin.

## First login (interactive, once per machine)

Run it in a real terminal. An agent's non-interactive shell can't type the password or Steam Guard
code.

```
C:\steam\builder\steamcmd.exe +login <username>
```

1. Enter the password and Steam Guard code when asked.
2. Wait for "Waiting for user info...OK", then type `quit`.
3. From then on, `+login <username>` with **no password** uses the cached token in
   `config/config.vdf`.
   - If the code comes by email instead, use `set_steam_guard_code <code>` and log in again.
   - Logging in again WITH a password issues a new token.
   - The token reportedly lasts months; a new machine or IP can end it sooner. Plan for an occasional
     manual re-login.
   - `config.vdf` grants full account access: never commit it or print it in CI logs.

## Account permissions

Owning the app doesn't matter for uploading. What matters is that the uploading Steam account has the
Steamworks permissions **Edit App Metadata** and **Publish App Changes To Steam** on the app.

- **Own account or a separate one:**
  - Your own account is fine for uploads from your own PC.
  - For CI, use a dedicated build account with only those permissions on that app.
- **Phone or Steam Mobile:** needed only to set the default branch live on a *released* app.

## One-time Steamworks setup (App Admin)

1. **Depot.** SteamPipe > Depots. A new app usually already has one depot, numbered AppID+1. Leave
   language and OS as "All". Save.
2. **Launch option.** Installation > General: the executable path relative to the install folder,
   OS Windows.
3. **Packages.** Associated Packages & DLC: the depot must be in the **Developer Comp** package (your
   own account's access), and in the **Beta Testing** (release override) package if testers get keys.
   A depot missing from a package gives "Invalid content configuration".
4. **Publish.** Publish tab > Prepare for Publishing > Publish to Steam (type the confirmation word).
   This publishes the configuration only. Unpublished config makes uploads fail with
   "Failed to get application info".
5. **Beta branch.**
   - SteamPipe > Builds > "Create new app branch". The name must have no spaces. Short generic names
     like `qa` may be rejected as invalid; a hyphenated name works.
   - **Set its password before anything goes live on it.**
   - Testers enter the password under the game's Properties > Game Versions & Betas.

## Upload (to be confirmed by a first real run)

```
steamcmd.exe +@ShutdownOnFailedCommand 1 +@NoPromptForPassword 1 +login <username> +run_app_build <abs path>\app_build_<appid>.vdf +quit
```

- **The "default" branch can't be set live by steamcmd.** Set it live in App Admin. A beta branch can
  be set live through `"SetLive" "<branch>"` in the app build VDF.
- **The exit code isn't reliable.** Treat it as success only if stdout has
  `Successfully finished AppID <id> build (BuildID <n>)` and no `ERROR!` or `Login Failure`.
- **Dry run first:** `"Preview" "1"`. It writes a manifest and logs to BuildOutput and uploads
  nothing. Check that exclusions such as Unity's `*_DoNotShip` and `*.pdb` work.

## Renaming a Unity Windows build's exe

A Unity player finds its data folder by its own name: `Foo.exe` needs `Foo_Data`. To ship a build under
another exe name, rename both the exe and the `_Data` folder. `UnityPlayer.dll` and
`UnityCrashHandler64.exe` keep their names.
