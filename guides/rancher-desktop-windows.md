# Rancher Desktop on Windows (Colima equivalent)

## What it is
Rancher Desktop is the free, open-source alternative to Docker Desktop on Windows. It provides the `docker` CLI, `docker compose`, and a container runtime (dockerd/moby). It's the Windows equivalent of Colima on macOS.

- **Why not Colima:** Colima uses Lima (Linux Machines), which is macOS-only. No Windows port exists.
- **Why Rancher Desktop over Docker Desktop:** Rancher Desktop is fully free and open-source, no license required.

---

## Full Setup Sequence (Windows 10/11)

### Step 0 — Verify hardware virtualization is enabled in BIOS
Run this first — if `VirtualizationFirmwareEnabled` is False, nothing else will work:
```powershell
Get-ComputerInfo -Property HyperVisorPresent, HyperVRequirementVMMonitorModeExtensions, HyperVRequirementVirtualizationFirmwareEnabled, HyperVRequirementSecondLevelAddressTranslation
```
Expected (working) state:
- `HyperVRequirementVMMonitorModeExtensions`: **True** — CPU supports VT
- `HyperVRequirementVirtualizationFirmwareEnabled`: **True** — BIOS has it on ← most common failure point
- `HyperVRequirementSecondLevelAddressTranslation`: **True** — SLAT supported

If `VirtualizationFirmwareEnabled` is **False**: enter BIOS/UEFI and enable:
- Intel CPUs: `Intel Virtualization Technology (VT-x)` — usually under Advanced → CPU Configuration
- AMD CPUs: `AMD Virtualization (AMD-V)` or `SVM Mode`
- Save (F10) and reboot. Then continue below.

### Step 1 — Enable Virtual Machine Platform Windows feature
Requires **admin PowerShell** (cannot be done from Git Bash or non-elevated terminal):
```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```
Then **restart the computer**.

### Step 2 — Install WSL and set default to v2
```powershell
# Run from PowerShell (winget is blocked in Git Bash)
wsl --install --no-distribution   # installs WSL components
wsl --update                       # ensure latest version
wsl --set-default-version 2
wsl --status                       # verify "Default Version: 2"
```

If Ubuntu is already installed as WSL1, upgrade it:
```powershell
wsl --set-version Ubuntu 2
```

### Step 3 — Install Rancher Desktop
```powershell
winget install --id SUSE.RancherDesktop --accept-package-agreements --accept-source-agreements
```
Download is ~667 MB. Takes several minutes.

### Step 4 — First launch configuration
On first launch, Rancher Desktop shows a setup wizard:
- Container engine: **`dockerd (moby)`** ← important — gives standard `docker` CLI
- Backend: **WSL2** (default)
- Allow admin access if prompted

First launch takes ~5 minutes while it downloads additional components.

### Step 5 — Verify
```bash
docker --version
docker run hello-world
```

---

## Diagnosing WSL2 / Rancher Desktop Errors

### Error: `HCS_E_HYPERV_NOT_INSTALLED`
```
WSL2 is not supported with your current machine configuration.
Error code: Wsl/Service/CreateVm/HCS/HCS_E_HYPERV_NOT_INSTALLED
```
**Cause:** Virtual Machine Platform Windows feature is not enabled, OR BIOS virtualization is disabled.

**Diagnose first:**
```powershell
Get-ComputerInfo -Property HyperVRequirementVirtualizationFirmwareEnabled
```
- If **False** → go to BIOS and enable VT-x / AMD-V, then restart
- If **True** → Virtual Machine Platform feature needs enabling (Step 1 above)

### Error: WSL distro still on version 1 after `wsl --set-default-version 2`
Setting the default only affects new distros. Existing distros must be upgraded manually:
```powershell
wsl --set-version Ubuntu 2
```
This will fail with `HCS_E_HYPERV_NOT_INSTALLED` if BIOS virtualization isn't on.

### `wsl --install --no-distribution` succeeds but WSL2 still fails
This command installs WSL-level components but does NOT enable the `VirtualMachinePlatform` Windows feature. You still need the `dism.exe` step (Step 1) in an admin terminal + restart.

### winget blocked from Git Bash
`/c/Users/.../AppData/Local/Microsoft/WindowsApps/winget: Permission denied`
Always run winget from **PowerShell**, not Git Bash.

### Elevation required for Windows features
`Get-WindowsOptionalFeature` and `dism.exe /enable-feature` both require an **admin PowerShell**. The Claude Code Bash tool cannot elevate — user must run these manually.

---

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

---

## Versions (verified 2026-04-05, Windows 10 Pro N 10.0.19045)
- Rancher Desktop: 1.22.0
- WSL: latest (via `wsl --update`)
