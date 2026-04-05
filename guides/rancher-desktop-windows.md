# Rancher Desktop on Windows (Colima equivalent)

## What it is
Rancher Desktop is the free, open-source alternative to Docker Desktop on Windows. It provides the `docker` CLI, `docker compose`, and a container runtime (dockerd/moby). It's the Windows equivalent of Colima on macOS.

- **Why not Colima:** Colima uses Lima (Linux Machines), which is macOS-only. No Windows port exists.
- **Why Rancher Desktop over Docker Desktop:** Rancher Desktop is fully free and open-source, no license required.

## Prerequisites

**WSL must be installed first** — user-level install from Microsoft Store or `wsl --install`. After install, upgrade to WSL2:

```powershell
# Run from PowerShell (NOT Git Bash — winget is blocked there due to App Execution Alias)
wsl --update
wsl --set-default-version 2
wsl --status   # verify "Default Version: 2"
```

**BIOS virtualization must be on.** If WSL2 refuses to enable, check BIOS for Intel VT-x or AMD-V and enable it.

Note: enabling Windows features (`dism.exe`) requires elevation. These cannot be run from the Claude Code Bash tool — use an admin PowerShell or Windows Terminal (Run as Administrator).

## Installation

```powershell
# Run from PowerShell (NOT Git Bash)
winget install --id SUSE.RancherDesktop --accept-package-agreements --accept-source-agreements
```

**Download size:** ~667 MB. Takes several minutes. Successfully tested on Windows 10 Pro N 10.0.19045.

## First Launch Configuration (IMPORTANT)

On first launch Rancher Desktop shows a setup wizard. **Container engine choice matters:**
- Choose **`dockerd (moby)`** — gives you the standard `docker` CLI
- Do NOT choose `containerd` — that uses `nerdctl` instead of `docker`
- Choose **WSL2 backend** (default on Windows)

After first launch completes (takes a few minutes while it downloads components), `docker` is available in all terminals.

## Verify
```bash
docker --version
docker run hello-world
```

## Usage for this project (project-hammer)
```bash
# Build the server image (from project root)
docker build -t project-hammer-api ./server

# Test run locally
docker run --rm -p 3001:3001 \
  -e AISSTREAM_API_KEY=your_key_here \
  -e CORS_ORIGIN=http://localhost:5173 \
  project-hammer-api

# Verify the health check
curl http://localhost:3001/api/health
```

## Version (verified 2026-04-05)
- Rancher Desktop: 1.22.0
- Installed via: `winget install --id SUSE.RancherDesktop`
- WSL version: 2 (required)

## Gotchas
- **winget blocked from Git Bash** — always run winget from PowerShell
- **WSL must be installed before Rancher Desktop** — winget handles the WSL dependency automatically if WSL is already installed; if not, install WSL first via Microsoft Store or `wsl --install` in an admin terminal
- **First launch is slow** — Rancher Desktop downloads additional components on first start (~5 min)
- **`docker` not in PATH until after first launch completes** — wait for the Rancher Desktop UI to show "Running" before testing `docker --version`
- **WSL1 → WSL2:** Existing WSL1 distros continue on WSL1 by default. Run `wsl --set-version Ubuntu 2` to upgrade an existing Ubuntu distro if needed.
- **dism.exe elevation:** Enabling Windows features requires admin PowerShell — cannot be done from the Claude Code Bash tool
