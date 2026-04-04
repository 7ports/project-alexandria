# GitHub CLI (gh)

## Quick Reference

**Install (Windows):**
```powershell
winget install --id GitHub.cli
```

**Auth:**
```bash
gh auth login
```

**Verify:** `gh --version`

**Key commands:** `gh repo clone <repo>`, `gh pr create`, `gh pr list`, `gh issue list`, `gh api <endpoint>`, `gh pages deploy`.

## Overview

The GitHub CLI (`gh`) provides GitHub functionality directly from the terminal — pull requests, issues, releases, gists, GitHub Actions, Pages deployment, and raw API access. It complements the GitHub MCP server by handling operations that require authenticated shell access (e.g., `gh auth`, `gh pages deploy`, `gh run watch`).

**When to use gh vs the GitHub MCP server:**
- **Prefer the GitHub MCP server** for structured operations (reading PRs, creating issues, searching repos) — it's more token-efficient since results come as structured data.
- **Use gh** when the MCP server can't do what you need: deploying Pages, watching CI runs, managing auth, or calling arbitrary API endpoints not exposed by the MCP server.

## Prerequisites

- Windows, macOS, or Linux
- A GitHub account
- A terminal with internet access

## Installation

### Windows (winget — recommended)

```powershell
winget install --id GitHub.cli
```

### Windows (Chocolatey)

```powershell
choco install gh
```

### Windows (Scoop)

```powershell
scoop install gh
```

### macOS (Homebrew)

```bash
brew install gh
```

### Linux (apt — Debian/Ubuntu)

```bash
sudo apt install gh
```

### Linux (dnf — Fedora)

```bash
sudo dnf install gh
```

## Configuration

### Authentication

```bash
gh auth login
```

Follow the interactive prompts to authenticate via browser or token. Supports:
- GitHub.com and GitHub Enterprise
- HTTPS and SSH protocols
- Personal access tokens

Check status:
```bash
gh auth status
```

### Setting Default Editor/Browser

```bash
gh config set editor "code --wait"
gh config set browser "chrome"
```

## Usage

### Repositories

```bash
gh repo clone owner/repo
gh repo create my-repo --public
gh repo fork owner/repo
gh repo view owner/repo --web
```

### Pull Requests

```bash
gh pr create --title "Title" --body "Description"
gh pr list
gh pr view 123
gh pr merge 123 --squash
gh pr checkout 123
gh pr diff 123
```

### Issues

```bash
gh issue create --title "Bug" --body "Description"
gh issue list --state open
gh issue view 456
gh issue close 456
```

### GitHub Actions

```bash
gh run list
gh run view 789
gh run watch 789
gh workflow list
```

### GitHub Pages

```bash
gh api repos/OWNER/REPO/pages --method POST \
  --field source='{"branch":"main","path":"/docs"}'
```

### Raw API Access

```bash
gh api repos/owner/repo
gh api repos/owner/repo/pulls/123/comments
gh api --method POST repos/owner/repo/issues -f title="New issue"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `gh: command not found` after install | Restart terminal; on Windows winget install may require a new shell |
| `gh auth login` hangs | Try `gh auth login --with-token < token.txt` instead of browser flow |
| Permission denied on Windows | Run terminal as administrator for the install step |
| Wrong account authenticated | `gh auth logout` then `gh auth login` with correct account |
| Chocolatey install fails with access denied | Use `winget install --id GitHub.cli` instead |
| npm `gh` package is wrong | `npm uninstall -g gh` — the correct CLI is installed via winget/brew/apt, not npm |

## Platform Notes

- **Windows**: winget is the most reliable install method. The npm package named `gh` is a *different tool* — do not use it.
- **macOS/Linux**: Homebrew or native package managers work best.
- The CLI stores auth credentials in the OS credential store (Keychain on macOS, Windows Credential Manager, etc.).

## Related Tools

- [GitHub MCP Server](github-mcp-server.md) — Structured GitHub API access via MCP (preferred for most operations)

## References

- [GitHub CLI Manual](https://cli.github.com/manual/)
- [GitHub CLI Repository](https://github.com/cli/cli)

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10, gh 2.89.0*
