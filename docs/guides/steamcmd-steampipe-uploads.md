---
id: steamcmd-steampipe-uploads
type: guide
title: steamcmd-steampipe-uploads
embedding_version: 1
---

# steamcmd — uploading game builds to Steam (SteamPipe) on Windows

**Confirmed working:** 2026-10. A dry run and a real upload, with SetLive on a password-protected beta
branch of an unreleased app.

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
- **Check it:** a second `+quit` prints `Loading Steam API...OK`. Logs go to `<install>/logs/`.
- **Versions:** it updates itself on every launch; there's nothing to pin.

## First login (interactive, once per machine)

Run it in a real terminal. An agent's non-interactive shell can't type the password or Steam Guard
code.

```
C:\steam\builder\steamcmd.exe +login <username>
```

1. Enter the password and Steam Guard code.
2. Wait for "Waiting for user info...OK", then type `quit`.
3. From then on, `+login <username>` with no password prints "Logging in using cached credentials."
   and works without prompts.
   - Logging in again WITH a password issues a new token.
   - The token reportedly lasts months; a new machine or IP can end it sooner. Plan for an occasional
     manual re-login.
   - `config.vdf` grants full account access: never commit it or print it in CI logs.

## Account permissions

Owning the app doesn't matter for uploading. What matters is that the uploading account has
**Edit App Metadata** and **Publish App Changes To Steam** on the app.

- **Own account or a separate one:** your own account is fine for uploads from your own PC. For CI,
  use a dedicated build account with only those permissions.
- **Phone or Steam Mobile:** needed only to set the default branch live on a *released* app.

## One-time Steamworks setup (App Admin)

1. **Depot.** SteamPipe > Depots. A new app usually already has one depot, numbered AppID+1.
2. **Launch option.** Installation > General: the executable path relative to the install folder,
   OS Windows.
3. **Packages.** Associated Packages & DLC: the depot must be in **Developer Comp** (partner-group
   accounts) and in the auto-created **"<App> Beta Testing"** release-override package (tester keys).
4. **Publish.** Publish tab > Prepare for Publishing > Publish to Steam. Unpublished config makes
   uploads fail with "Failed to get application info".
5. **Beta branch.**
   - SteamPipe > Builds > "Create new app branch". The name must have no spaces. Short names like
     `qa` were rejected as invalid; a hyphenated name like `special-test` works.
   - Set its password before anything goes live on it.

## Upload

**App build VDF:** `"AppBuild" { "AppID" "<id>" "Desc" "<version>" "ContentRoot" "<abs dir>\\"
"BuildOutput" "<abs dir>\\" "Preview" "0" "SetLive" "<branch>" "Depots" { "<depotid>"
"depot_build_<depotid>.vdf" } }`

**Depot build VDF:** `"DepotBuild" { "DepotID" "<id>" "ContentRoot" "<abs dir>\\" "FileMapping" {
"LocalPath" "*" "DepotPath" "." "Recursive" "1" } "FileExclusion" "*.pdb" }`

Simplest is to copy the build to a staging folder with the unwanted files (Unity's `*_DoNotShip`
folders, `.pdb`) already left out, rather than relying on FileExclusion wildcard semantics.

```
steamcmd.exe +@ShutdownOnFailedCommand 1 +@NoPromptForPassword 1 +login <username> +run_app_build <abs path>\app_build_<appid>.vdf +quit
```

**Success lines:**
- `Successfully finished AppID <id> build (BuildID <n>).`
- For a preview: `Successfully finished AppID <id> build preview.`

**The exit code is 0 either way.** steamcmd also always prints "Looks like steam didn't shutdown
cleanly" after a run, which is harmless. Decide success from the success line plus the absence of
`ERROR!` / `Login Failure` / an uppercase `FAILED` / `Cached credentials not found`.

**GOTCHA:** match failure words **case-sensitively**. steamcmd echoes its own convars, e.g.
`"@ShutdownOnFailedCommand" = "1"`, so a case-insensitive "failed" check flags every run as failed.

**Dry run:** `"Preview" "1"` (and no SetLive). It uploads nothing and writes
`<BuildOutput>/<depotid>_preview.manifest.txt` listing every file. Check the exe name and that the
exclusions worked.

**Speed:** a 130 MB Unity Mono build uploaded in about 12 s after a few seconds of scanning.
SteamPipe only sends changed chunks after that.

**SetLive on a beta branch works from steamcmd.** The "default" branch can't be set live by steamcmd;
set it in App Admin > Builds.

## Renaming a Unity Windows build's exe

**Confirmed:** a Unity player finds its data folder by its own name: `Foo.exe` needs `Foo_Data`. To
ship under another exe name, rename both the exe and the `_Data` folder; `UnityPlayer.dll` and
`UnityCrashHandler64.exe` keep their names.

- **Quick headless smoke test:** `Foo.exe -batchmode -nographics -logFile <path>`. Look for
  `Mono path[0] = '.../Foo_Data/Managed'` and `UnloadTime` (the first scene loaded), then kill it.

## Giving testers access to an unreleased app

- **Release State Override keys:** Request Steam Product Keys > the Beta Testing package. Activators
  can play immediately.
  - About 2,500 keys in total across all requests; each request is reviewed; ask in small batches.
  - Default Release keys don't unlock before release.
  - Developer Comp keys are for developers only, per Valve. Adding testers to the partner group
    ("Visibility Only") makes them Steam Community moderators of your apps.
- **Testers:**
  - activate at https://store.steampowered.com/account/registerkey or via Steam > + Add a Game >
    Activate a Product;
  - then Properties > Game Versions & Betas > enter the branch password.
- **Revoking:** ban keys (Ban or Disable Steam Keys), or change the branch password.
