---
id: project-voltron-docker
type: guide
title: "Project Voltron — Docker Agent Setup"
summary: >
  Project Voltron runs specialist Claude Code agents inside Docker containers via `run_agent_in_docker`.
tags: [claude-agents]
status: active
created: 2026-06-17
updated: 2026-06-17
embedding_version: 1
---

# Project Voltron — Docker Agent Setup

## Overview

Project Voltron runs specialist Claude Code agents inside Docker containers via `run_agent_in_docker`. The container mounts the project workspace and Claude auth credentials, then invokes `claude --dangerously-skip-permissions` autonomously.

---

## Known Issues & Fixes

### 1. Git commits fail inside Docker ("Please tell me who you are")

**Root cause:** `node:20-slim` has no git user identity configured for the container user (`voltron`). Git requires `user.name` and `user.email` to commit.

**Fix A — Dockerfile (baked in, survives rebuilds):**
```dockerfile
USER voltron
RUN git config --global user.name "Voltron Agent" && \
    git config --global user.email "voltron@project-hammer.local" && \
    git config --global --add safe.directory /workspace
```

**Fix B — Runtime env vars in `project-voltron/src/index.js` (works immediately, no rebuild needed):**

In the `run_agent_in_docker` tool, add a `gitEnvArgs` array alongside `authEnvArgs`:
```javascript
const gitEnvArgs = [
  "-e", "GIT_AUTHOR_NAME=Voltron Agent",
  "-e", "GIT_AUTHOR_EMAIL=voltron@project-hammer.local",
  "-e", "GIT_COMMITTER_NAME=Voltron Agent",
  "-e", "GIT_COMMITTER_EMAIL=voltron@project-hammer.local",
];

const dockerArgs = [
  "run", "--rm",
  "--entrypoint", "bash",
  ...authEnvArgs,
  ...gitEnvArgs,   // <-- add this
  ...
]
```

`GIT_AUTHOR_*` / `GIT_COMMITTER_*` env vars override git config entirely — they work even on cached images that predate the Dockerfile fix.

**Apply both fixes** for belt-and-suspenders. The env var fix is immediate; the Dockerfile fix ensures new image builds are correct from scratch.

---

### 2. `git` not installed in `node:20-slim`

**Root cause:** `node:20-slim` is a minimal Debian image — git is not included.

**Fix:** Add to Dockerfile.voltron before the `useradd` step:
```dockerfile
RUN apt-get update && apt-get install -y git ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
```

After updating Dockerfile.voltron, rebuild:
```bash
docker build -f Dockerfile.voltron -t voltron-agent .
```

Verify:
```bash
docker run --rm --entrypoint bash voltron-agent -c "git config --global user.email && git config --global user.name"
# Should print: voltron@project-hammer.local / Voltron Agent
```

---

### 3. Claude OAuth token not passed to container

**Root cause:** `CLAUDE_CODE_OAUTH_TOKEN` lives in the host process environment (not a file), so simple `-v` mounts don't expose it.

**Fix:** Pass it explicitly via `-e` in the Docker run args (already implemented in Voltron v2.3.7+):
```javascript
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  authEnvArgs.push("-e", `CLAUDE_CODE_OAUTH_TOKEN=${process.env.CLAUDE_CODE_OAUTH_TOKEN}`);
}
```

> **Note on the host pre-flight check:** A `Token: NO` result from a pre-flight script run via the Bash tool can be a **false negative** — the bash-spawned subshell does not source the user's interactive shell profile, whereas the Voltron MCP server (spawned by Claude Code itself) does have the token. The real test of auth is the first `run_agent_in_docker` dispatch: if the agent runs Claude successfully, auth is fine regardless of what the subshell pre-flight reported.

---

### 4. Agent hits max_turns before committing

**Symptom:** Agent writes files but runs out of turns before reaching the `git commit` step.

**Fixes:**
- Increase `max_turns` to 40–50 for complex tasks
- Scope the task prompt tightly — pre-read files for the agent so it doesn't spend turns doing that itself
- Split the commit into a **separate** dispatch from the edit (commit-budgeting), so an edit that exhausts its turn budget does not also lose the commit

---

### 5. Push / PR fail inside Docker ("could not read Username" / "gh: not authenticated" / HTTP 401)

**Root cause:** The container mounts the *Claude* OAuth token (issue #3) but has **no GitHub credentials** — no `gh` auth state, no git credential helper, no `GITHUB_TOKEN`/`GH_TOKEN`. So publish agents (`pr-opener`, and any `git push` from `committer`/`branch-manager`) fail the moment they touch `origin`:

```
fatal: could not read Username for 'https://github.com': No such device or address
gh: To get started with GitHub CLI, please run:  gh auth login   (HTTP 401)
```

Editing and committing **locally** work fine inside Docker (issues #1–#2); only operations that talk to the GitHub remote fail.

**Fix / workflow:** Do the network publish step from the **host** session, where `gh` is already authenticated (e.g. via `gh auth login` in the user's shell):

1. Let the Docker `committer` create the commit locally on a feature branch (this works in-container).
2. From the host, push the branch and open the PR:
   ```bash
   git push -u origin <feature-branch>
   gh pr create --base main --head <feature-branch> --title "..." --body-file <body.md>
   ```
3. Instruct the `pr-opener` task to **detect** the auth failure and report the exact error rather than emitting a false `[DONE]`, so the orchestrator knows to take over the push on the host.

**Related — `main` is branch-protected (GH013):** On repos with a ruleset requiring PRs, a direct `git push origin main` is rejected:
```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Changes must be made through a pull request.
```
Always land changes via a feature branch + PR. If local `main` is ahead of `origin/main` by unrelated commits (e.g. reflection-add commits), rebase your fix branch directly onto `origin/main` so the PR is a single clean commit:
```bash
git rebase --onto origin/main main <feature-branch>
```
(Stash any stray working-tree edits first — EOL/autocrlf drift on a tracked file will block the rebase with "cannot rebase: You have unstaged changes".)

**Future hardening:** to make in-container publish work, pass a `GH_TOKEN`/`GITHUB_TOKEN` env var into the container (mirroring the `CLAUDE_CODE_OAUTH_TOKEN` pattern in issue #3) and configure git to use it as a credential helper. Until that is implemented, host-side push is the supported path.

---

## Dockerfile.voltron — Correct Template

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y git ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
RUN useradd -m -s /bin/bash voltron
USER voltron
RUN git config --global user.name "Voltron Agent" && \
    git config --global user.email "voltron@project-hammer.local" && \
    git config --global --add safe.directory /workspace
WORKDIR /workspace
ENTRYPOINT ["claude"]
```

---

## Parallel Execution Strategy

For independent tasks that should run concurrently, use the **`run_agent_in_docker_batch`** MCP tool (Voltron v3.x): one MCP call with 2–8 `dispatches` entries fans out to N parallel containers and returns a single batch result. This is the supported parallel path and is immune to the main-session tool-call serializer.

- Verified parallel in practice: two `harness-engineer` dispatches on disjoint files started within the same second (`[entry]` timestamps identical) and ran concurrently.
- Keep parallel dispatches on **disjoint file sets** to avoid working-tree races; the containers share the mounted workspace.
- The batch result can be very large (full per-agent transcripts) and may overflow the tool-result limit — it is saved to a file. Extract just the signal (`[DONE]`, `PASS`/`FAIL`, `"outcome"`, `[exit]`) with `grep` rather than reading the whole file.

> Historical note: older guidance here said `run_agent_in_docker` is strictly serial (`spawnSync`) and recommended the host `Agent` tool for parallelism. The `run_agent_in_docker_batch` tool supersedes that for in-Docker parallel work.
