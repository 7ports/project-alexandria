---
id: r-windows-setup
type: guide
title: "R / Rscript on Windows — Setup Guide"
summary: ""
tags: []
status: active
created: 2026-06-17
updated: 2026-06-17
embedding_version: 1
---

# R / Rscript on Windows — Setup Guide

Setting up R so `Rscript` can run scripts (e.g. data-cleanup scripts using
`readxl`, `openxlsx`, `httr2`, `jsonlite`).

## Install R

Pick one:
- **Installer (simplest):** https://cran.r-project.org/bin/windows/base/
- **Chocolatey:** `choco install r.project -y` — **must run in an elevated
  (Administrator) terminal.** A non-admin shell fails with
  `Access to the path 'C:\ProgramData\chocolatey\lib\R.Project\...' is denied`.
- **winget:** `winget install RProject.R`

Installs to `C:\Program Files\R\R-<version>\` with binaries in
`bin\` and `bin\x64\`. `Rscript.exe` is **not added to PATH automatically** —
add `C:\Program Files\R\R-<version>\bin` to PATH, or call it by full path.

## Install packages (no admin needed)

```bash
Rscript -e "install.packages(c('readxl','openxlsx','httr2','jsonlite'), repos='https://cloud.r-project.org')"
```

**Gotcha:** the default system library `C:\Program Files\R\R-<ver>\library` is
**not writable** without admin → error `'lib = "..."' is not writable` /
`unable to install packages`. R normally prompts to use a personal library, but
in non-interactive `Rscript` mode it just errors. Fix: install into the personal
library explicitly:

```r
lib <- file.path(Sys.getenv("LOCALAPPDATA"), "R", "win-library",
                 paste(R.version$major, sub("\\..*","",R.version$minor), sep="."))
dir.create(lib, recursive = TRUE, showWarnings = FALSE)
install.packages(c("readxl","openxlsx","httr2","jsonlite"), lib = lib,
                 repos = "https://cloud.r-project.org")
```

Once that personal library exists, R adds it to `.libPaths()` automatically on
subsequent runs, so scripts find the packages without extra config.

## BIG gotcha: running Rscript.exe from Git Bash / MSYS segfaults

Invoking `Rscript.exe` from a Git-Bash / MSYS2 shell can **segfault** (silent
"no output", or `Segmentation fault`) when packages with compiled code
(openssl/curl via `httr2`, `stringi`, `openxlsx`) load. Cause: `/mingw64/bin`
(and similar) on PATH expose conflicting DLLs that R's own DLLs collide with.

**Fix:** give R a clean PATH that puts its own `bin\x64` first and drops mingw:
```bash
export PATH="/c/Program Files/R/R-<ver>/bin/x64:/c/Windows/System32:/c/Windows:/usr/bin"
Rscript.exe yourscript.R
```
In a normal Windows terminal (cmd / PowerShell) this issue does not occur —
it's specific to the MSYS environment. Note: routing through `powershell.exe`
may be blocked by Claude Code permission rules; running the binary directly with
a sanitized PATH is the reliable workaround.

## Verify
```bash
Rscript --version
Rscript -e "for (p in c('readxl','openxlsx','httr2','jsonlite')) cat(p, as.character(packageVersion(p)), '\n')"
```

## Versions confirmed working (2026-06)
R 4.6.0; readxl 1.5.0, openxlsx 4.2.8.1, httr2 1.2.2, jsonlite 2.0.0.
