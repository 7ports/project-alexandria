---
id: vcredist-windows
type: guide
title: Microsoft Visual C++ Redistributable (Windows)
summary: Check and upgrade the VC++ 2015-2022 x64 runtime; an outdated msvcp140.dll (<14.40) makes native modules built with VS 2022 17.10+ fail with 'DLL initialization routine failed'.
tags:
  - windows
  - native-modules
  - runtime
  - winget
status: active
source_urls:
  - "https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist"
  - "https://aka.ms/vs/17/release/vc_redist.x64.exe"
embedding_version: 1
---

# Microsoft Visual C++ Redistributable (Windows)

## Quick Reference

**Check installed version:**
```powershell
winget list --id Microsoft.VCRedist.2015+.x64
(Get-Item C:\Windows\System32\msvcp140.dll).VersionInfo.FileVersion
```

**Upgrade (one UAC prompt):**
```powershell
winget upgrade --id Microsoft.VCRedist.2015+.x64 --exact --silent --accept-package-agreements --accept-source-agreements
```
Manual alternative: https://aka.ms/vs/17/release/vc_redist.x64.exe (always the latest 2015-2022 x64 build).

**Verify:** the failing native module now loads (e.g. `node -e "require('<native-pkg>')"`).

## Overview

The VC++ 2015-2022 redistributable is a single, binary-compatible runtime (`msvcp140.dll`, `vcruntime140.dll`, `vcruntime140_1.dll` in System32) shared by every MSVC-built program and native addon on the machine. Installing a newer version is safe for older programs; an **older** runtime breaks newer binaries.

## The 14.40 break (the gotcha worth remembering)

Binaries built with **VS 2022 17.10 or newer** use a changed `std::mutex` (constexpr constructor) and require **msvcp140.dll ≥ 14.40**. Against an older runtime (e.g. 14.29 from a VS 2019-era install, common on older Windows 10 machines) they fail at static initialisation:

```
A dynamic link library (DLL) initialization routine failed.
<path>\<module>.node
```
or crash with an access violation inside `mutex::lock`.

Signs it's this and not something else:
- Only on Windows; the same `node_modules`/package works elsewhere.
- No export is missing (it is not "The specified procedure could not be found"), so reinstalling the package, `npm rebuild`, or switching Node versions does **not** help.
- Seen with: `onnxruntime-node` 1.21+ (Transformers.js embeddings), and other prebuilt native addons/apps shipped from 2024-06 onward.

Fix: upgrade the redistributable (above). No reboot was needed in practice; already-running processes keep the old DLL loaded until restarted.

## Platform Notes

- winget worked when invoked from Git Bash via `powershell.exe -NoProfile -Command "winget ..."`; calling the `winget` app-execution alias directly from Git Bash can fail with "Permission denied" on some machines — prefer PowerShell.
- The installer self-elevates; with `--silent` there is still one UAC prompt the user must approve.
- winget may list the installed entry as "2015-2019 ... 14.29" — it upgrades in place to the 2015-2022 package.
- Apps that bundle their own copies (Firefox, Edge, etc.) carry newer DLLs in their own folders; those do not fix System32-loaded modules, and copying them around is not a supported fix.

## Related Tools

- alexandria-mcp-server (embedder WebAssembly fallback when onnxruntime-node won't load)

---

*Last updated: 2026-10-19*
*Setup verified on: Windows 10 (14.29 → 14.51 via winget 1.29)*
