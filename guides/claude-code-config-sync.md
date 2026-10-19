---
id: claude-code-config-sync
type: guide
title: Syncing Claude Code config (~/.claude) across machines with git + hooks
summary: "Make ~/.claude a private git repo with an allowlist .gitignore; SessionStart/Stop hooks commit, pull --rebase and push. Gotchas for Windows, secrets, MCP servers in ~/.claude.json, and making new-machine setup agent-runnable."
tags:
  - claude-code
  - dotfiles
  - git
  - hooks
  - windows
  - mcp
  - agent-setup
status: verified
embedding_version: 1
---

# Syncing Claude Code config across machines

## Approach (verified on Windows 10 + Git Bash, Claude Code 2.1.x)
- `git init` inside `~/.claude`, with an **allowlist** `.gitignore`: `*` then `!settings.json`, `!CLAUDE.md`, `!keybindings.json`, `!statusline*`, `!README.md`, `!skills/` + `!skills/**`, same for `commands/`, `agents/`, `output-styles/`. Credentials, history, sessions, projects and the plugin cache are then never committed.
- Private GitHub remote. Hooks in `settings.json` (which syncs itself):
  - `SessionStart` (matcher `startup|resume`, timeout ~90): commit → `git pull --rebase` → push.
  - `Stop`: check `git status --porcelain` locally; only if dirty, spawn the full sync with `nohup ... </dev/null >>log 2>&1 &` so the turn isn't blocked (returns in ~0.2s).
- Hook commands like `bash ~/.claude/sync/sync.sh start` work on Windows: Claude Code runs hooks through Git Bash, so `~` expands.

## Gotchas
- **Don't use `pull --autostash`**: a conflicting stash pop leaves conflict markers in settings.json and breaks Claude Code. Commit first, `pull --rebase`, and on failure `git rebase --abort` + warn.
- Warn the user from SessionStart with JSON on stdout: `{"systemMessage": "..."}` (plain stdout goes into the model context instead).
- Set `GIT_TERMINAL_PROMPT=0`, `GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=8"` and wrap network calls in `timeout` so offline sessions never hang.
- Use a `mkdir` lock (atomic) since several sessions can fire hooks at once; treat locks older than ~2 min as stale.
- Add `.gitattributes` `* text=auto eol=lf` and set `core.autocrlf false` in the repo, or CRLF skill/script files break bash on other machines.
- If helper scripts live in an allowlisted folder, Python scripts that `import` each other create `__pycache__/` there, which then syncs. Set `sys.dont_write_bytecode = True` and ignore `__pycache__/`.
- **Secrets**: `settings.json` `env` often holds `CLAUDE_CODE_OAUTH_TOKEN` or API keys. Move them into real environment variables (Windows: `[Environment]::SetEnvironmentVariable(name, value, 'User')`; only new terminals see it), and add a pre-commit hook that greps staged `+` lines for `sk-ant-`, `gh[opsu]_`, `github_pat_`, `Bearer <long>`, private-key headers.
- **MCP servers** are in `~/.claude.json` (mixed with machine state, so don't commit it). Export only `mcpServers` to a tracked file, replacing the home path with a placeholder and env/header values whose keys look like key/token/secret/auth with `{{SECRET:NAME}}`. Keep the values in an untracked secrets file that you copy by hand. For two-way sync, keep an untracked snapshot of the last agreed state so each side applies diffs (otherwise one machine's stale export reverts the other's changes). Don't drop a server just because its secret is missing locally.
- `claude` installed via npm on Windows is `claude.cmd`: passing JSON to `claude mcp add-json` through cmd.exe is fragile. A direct read-modify-write of `~/.claude.json` (only `mcpServers`, atomic `os.replace`, backup first) is simpler.
- Python on Windows: probe `python`, `py`, `python3` in that order. `python3` may be the Microsoft Store stub.
- Joining a machine that already has `~/.claude`: `git init`, add remote, fetch, `git checkout -f -B main origin/main` (back up the files it'll overwrite first). Untracked files like `.credentials.json` are untouched.
- Plugins: sync `enabledPlugins` + `extraKnownMarketplaces` in settings.json, not the `plugins/` cache. Install non-interactively with `claude plugin marketplace add <owner/repo> && claude plugin install <plugin>@<marketplace> --scope user`. Check installed state in `~/.claude/plugins/installed_plugins.json` and `known_marketplaces.json`.
- The first `claude` CLI run against an empty `~/.claude.json` runs migrations that can rewrite `settings.json` (key order, and `"model": "opus"` became `"opus[1m]"` in 2.1.x). Have people run Claude Code and log in once *before* joining the sync, so this doesn't sync back to every machine.

## Making setup agent-runnable
- Ship a "doctor" script that prints `FIX <problem>` + `run: <exact command>` for things an agent can do and `ASK <problem>` for human-only steps (`gh auth login`, `/login`, `/mcp` OAuth logins, copying the secrets file), and exits 0 once there's nothing left to FIX. The README then just says "loop on the doctor until it exits 0".
- MCP OAuth logins are recorded in `~/.claude/.credentials.json` under `mcpOAuth`, with keys like `<server>|<hash>`, so a script can tell which http servers still need `/mcp`.
- winget installs only reach PATH in new terminals, and the agent's shell inherits Claude Code's stale PATH. In scripts, also look in the default install folders (`C:/Program Files/GitHub CLI`, `C:/Program Files/nodejs`, `%LOCALAPPDATA%/Microsoft/WinGet/Links`, `%LOCALAPPDATA%/Programs/Python/Python3*`). Non-interactive form: `winget install -e --silent --accept-package-agreements --accept-source-agreements --id <id>`.
- Keep a tracked list of the local repos that MCP servers run from (path, clone URL, install command, a path that exists once installed), so the doctor can print exact clone and install commands.
- Bootstrapping a private repo needs `gh` and a login before the agent can even read the README, so put a short paste-in prompt in the README (install gh → ask the user to `! gh auth login` → clone → follow the "For agents" section).
- Under `set -e`, `x="$(cmd)"` aborts the script if `cmd` fails (for example, `cygpath` with an empty argument). Add `|| x=""`.
