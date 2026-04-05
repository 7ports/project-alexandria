# Rancher Desktop on Windows (Colima equivalent)

## What it is
Rancher Desktop is the free, open-source alternative to Docker Desktop on Windows. It provides the `docker` CLI, `docker compose`, and a container runtime (dockerd/moby). It's the Windows equivalent of Colima on macOS.

- **Why not Colima:** Colima uses Lima (Linux Machines), which is macOS-only. No Windows port exists.
- **Why Rancher Desktop over Docker Desktop:** Rancher Desktop is fully free and open-source, no license required.

## Prerequisites

**WSL2 must be enabled.** Check current state:
```powershell
wsl --status
wsl --list --verbose
```
If Ubuntu shows `VERSION 1`, or if you see "Please enable the Virtual Machine Platform", WSL2 is not enabled.

**BIOS virtualization must be on.** If WSL2 refuses to enable, check BIOS for Intel VT-x or AMD-V and enable it.

## Setup Steps (must be run from elevated/admin PowerShell)

### Step 1 — Enable required Windows features
```powershell
# Run as Administrator
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

### Step 2 — Restart the computer
Required after enabling the features above.

### Step 3 — Upgrade WSL to version 2
```powershell
wsl --update
wsl --set-default-version 2
# Verify:
wsl --status  # should show "Default Version: 2"
```

### Step 4 — Install Rancher Desktop via winget
```powershell
# Run from PowerShell (winget is blocked from Git Bash due to App Execution Alias)
winget install --id SUSE.RancherDesktop --accept-package-agreements --accept-source-agreements
```
This downloads ~800MB. Takes 5-10 minutes.

### Step 5 — First launch configuration
On first launch, Rancher Desktop shows a setup wizard. Choose:
- **Container engine: `dockerd (moby)`** — gives you the standard `docker` CLI
  (Not `containerd` — that uses `nerdctl` instead of `docker`)
- **WSL2 backend** (default on Windows)
- Enable "Allow admin access" if prompted

Rancher Desktop adds `docker` to PATH automatically after first launch.

### Step 6 — Verify
```bash
docker --version
docker run hello-world
```

## Usage for this project
Test the server Dockerfile:
```bash
# From project root
docker build -t project-hammer-api ./server

# Test run (replace key with actual value)
docker run --rm -p 3001:3001 \
  -e AISSTREAM_API_KEY=your_key \
  -e CORS_ORIGIN=http://localhost:5173 \
  project-hammer-api

# Verify health check
curl http://localhost:3001/api/health
```

## Version (as of 2026-04-05)
- Rancher Desktop: 1.22.0 (available via `winget search SUSE.RancherDesktop`)

## Gotchas
- **winget blocked from Git Bash** — run winget commands from PowerShell, not Git Bash
- **Elevation required** — enabling Windows features (`dism.exe`) requires an admin PowerShell
- **BIOS check** — if Virtual Machine Platform won't enable, check BIOS for VT-x/AMD-V
- **WSL1 → WSL2 migration** — existing WSL1 distros continue to run on WSL1 by default; only new distros default to WSL2 after `wsl --set-default-version 2`. Run `wsl --set-version Ubuntu 2` to upgrade an existing Ubuntu distro if needed.
- **First launch is slow** — Rancher Desktop downloads additional components on first start (~5 min)
- **Restart required** — the VirtualMachinePlatform feature needs a restart before WSL2 works
