---
id: docker-agent-git-failures-large-bind-mount
type: reference
title: Two distinct git failure modes for containerized coding agents on Docker Desktop (Windows) with a large bind-mounted repo
summary: "Rebuilding the agent image fixes the 'gitconfig Device or resource busy' error; a separate failure — git status/diff hanging on a large bind-mounted working tree — is an environment limit, not a bug. Workaround: commit on the host; keep container agents to file-edit + grep."
tags:
  - docker
  - git
  - windows
  - bind-mount
  - ci-agents
  - unity
embedding_version: 1
---

## Context

A coding-agent framework runs specialist agents inside Docker containers that bind-mount the host repo (`-v <repo>:/workspace`). On Docker Desktop for Windows with a **large working tree** (e.g. a Unity project — thousands of `Assets/**` files), container-side git can fail in two *distinct* ways that are easy to conflate.

## Failure mode 1 — `gitconfig: Device or resource busy` (image staleness)

```
error: could not write config file /home/<user>/.gitconfig: Device or resource busy
```
The container exits non-zero (often SIGKILL/137) the moment an agent runs almost any git command. Root cause was a stale agent **image** predating the framework's fix. **Fix:** rebuild the agent image so the fix is baked in:
```
docker build --no-cache -f <Dockerfile> -t <agent-image>:latest .
```
The `Dockerfile` mtime may be unchanged while the *files it COPYs / packages it installs* changed, so a cached build can silently keep the old behavior — use `--no-cache` when the goal is to prove a rebuild took. After rebuild, file-editing agents (that use Read/Edit/Write + `grep`) run clean.

## Failure mode 2 — `git status` / `git diff` hang (bind-mount scan cost)

After fixing mode 1, a commit agent can still fail differently:
- `git config` and `git log` **succeed** (they don't scan the working tree).
- `git status` / `git diff` / `git add` **hang** and time out (exit 124), eventually killing the agent at its wall-clock cap.

This is **not** a lock or corruption — verify by running `git status` on the **host**, where it returns in ~0.1s and shows no stale `.git/index.lock`. The container hang is Docker Desktop for Windows' bind mount (9p/virtiofs) being pathologically slow at the `lstat` storm that a working-tree scan performs over a large repo. It is an environment limitation, not an agent bug.

## Working pattern

- **Do all commits/pushes on the host session** (native filesystem → git is fast and reliable). Treat the host as the single actor that pushes a given branch.
- **Keep container agents to file edits + `grep`-based validation** — explicitly instruct them to run **no git commands** (some sub-agents run `git diff` for verification and will hang/err). Example directive: *"Do NOT run any git command; validate only with grep; the host handles git."*
- Rebuild the agent image after any framework update before trusting container git again.
- Don't infer "commits are broken" from a hang — check whether the agent's **file edits already landed on disk** (the bind mount persists writes even when the container is later killed); usually they have, and you just need to commit them host-side.
