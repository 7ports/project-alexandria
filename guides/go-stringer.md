---
id: go-stringer
type: guide
title: "Go + Stringer Setup (Windows)"
summary: ""
tags: []
status: active
created: 2026-06-17
updated: 2026-06-17
embedding_version: 1
---

# Go + Stringer Setup (Windows)

Setup notes for Go toolchain and the `stringer` tools on Windows.

> ⚠️ **Two different tools are named `stringer`** — and both install to `%USERPROFILE%\go\bin\stringer.exe`, so installing one **silently overwrites the other**.
>
> | Tool | Module | Purpose |
> |---|---|---|
> | **Go enum generator** | `golang.org/x/tools/cmd/stringer` | Generates `String()` methods for int enums (`//go:generate`) |
> | **Voltron stringer** | `github.com/davetashner/stringer` | Codebase-archaeology tool; mines repos into Beads-formatted issues. Required by Project Voltron's `code-analyst` / `stringer-baseline-builder` / `stringer-delta-reader` agents |
>
> **Identify which one you have:** run `stringer --help`. The Voltron one shows subcommands `init / scan / report / baseline / collectors / context / docs`. The enum generator shows a short flag-based usage (`-type`).
>
> If you need both, install only one to `go/bin` and rename, or keep the full path of the other. For a machine running Project Voltron, keep the **davetashner** build on PATH.

## Quick Reference

```bash
# Verify Go is installed (tested with Go 1.26.2)
go version
where go    # typically C:\Program Files\Go\bin\go.exe

# --- Voltron stringer (codebase archaeology — required by Project Voltron) ---
go install github.com/davetashner/stringer/cmd/stringer@latest
# Alternative: download a prebuilt binary from
# https://github.com/davetashner/stringer/releases/latest

# --- Go enum generator (only if you need //go:generate String() methods) ---
go install golang.org/x/tools/cmd/stringer@latest

# Both land here on Windows:
#   %USERPROFILE%\go\bin\stringer.exe   (bash: $HOME/go/bin/stringer.exe)

# Verify which is active
stringer --help     # davetashner -> shows init/scan/report subcommands
```

## What is stringer?

There are two unrelated tools sharing the name:

- **Voltron stringer** (`github.com/davetashner/stringer`) — "codebase archaeology tool that mines existing repositories to produce Beads-formatted issues." Extracts actionable work items from TODOs, FIXMEs, git history, etc. Subcommands: `init`, `scan`, `report`, `baseline`, `collectors`, `context`, `docs`.
- **Go enum generator** (`golang.org/x/tools/cmd/stringer`) — generates `String()` methods for integer-typed enums so they print as their name instead of a number. Used via `//go:generate stringer -type=MyEnum`.

## Prerequisites

- Go installed (any recent version; tested with Go 1.26.2)
- `$GOPATH/bin` (default `%USERPROFILE%\go\bin`) on PATH to invoke `stringer` without a full path

## PATH on Windows

`go install` drops binaries in `%USERPROFILE%\go\bin\`. If that directory is not on your PATH, either:
- Add it via System Properties → Environment Variables, or
- Invoke with the full path: `$HOME/go/bin/stringer.exe` from bash

**Voltron detection gotcha:** `setup_voltron` may report stringer as "NOT INSTALLED" even when it is, if `%USERPROFILE%\go\bin` is not visible on the PATH seen by the MCP server process. Confirm manually with `stringer --help`; if the davetashner subcommands appear, it is installed and the warning is a false negative.

## Gotchas

- **Name collision (see top)** — installing `golang.org/x/tools/cmd/stringer` over the Voltron build (or vice versa) overwrites `stringer.exe` with no warning. Verify with `stringer --help` after any install.
- **No separate "stringer install" command** — the phrase usually refers to `go install <module>@latest`.
- **Not bundled with Go** — both stringers ship outside the standard library; you must `go install` (or download a release) explicitly.
- **Enum generator: generated files are committed** — output (e.g. `myenum_string.go`) is checked in, not regenerated at build time.

## Usage Example (enum generator)

```go
//go:generate stringer -type=Color
type Color int

const (
    Red Color = iota
    Green
    Blue
)
```

Then run `go generate ./...` from the package directory.

## References

- Voltron stringer: https://github.com/davetashner/stringer
- Go enum generator: https://pkg.go.dev/golang.org/x/tools/cmd/stringer
