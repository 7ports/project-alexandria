# Go + Stringer Setup (Windows)

Setup notes for Go toolchain and the `stringer` code generator on Windows.

## Quick Reference

```bash
# Verify Go is installed
go version
where go    # typically C:\Program Files\Go\bin\go.exe

# Install stringer
go install golang.org/x/tools/cmd/stringer@latest

# Stringer binary lands here on Windows
# %USERPROFILE%\go\bin\stringer.exe
# In bash: $HOME/go/bin/stringer.exe

# Verify
"$HOME/go/bin/stringer.exe" -h
```

## What is stringer?

`stringer` is a Go code generator from the official `golang.org/x/tools` repo. It generates `String()` methods for integer-typed enums so they print as their declared name instead of a number. Used via `//go:generate stringer -type=MyEnum` directives.

## Prerequisites

- Go installed (any recent version; tested with Go 1.26.2)
- `$GOPATH/bin` (default `%USERPROFILE%\go\bin`) on PATH if you want to invoke `stringer` without a full path

## PATH on Windows

`go install` drops binaries in `%USERPROFILE%\go\bin\`. If that directory is not on your PATH, either:
- Add it via System Properties → Environment Variables, or
- Invoke with the full path: `$HOME/go/bin/stringer.exe` from bash

## Gotchas

- **No separate "stringer install" command** — there is no `stringer install`. The phrase usually refers to `go install golang.org/x/tools/cmd/stringer@latest`.
- **Not bundled with Go** — stringer ships under `golang.org/x/tools`, not the standard library, so you must `go install` it explicitly.
- **Generated files are committed** — output (e.g. `myenum_string.go`) is meant to be checked in, not regenerated at build time.

## Usage Example

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

- https://pkg.go.dev/golang.org/x/tools/cmd/stringer
