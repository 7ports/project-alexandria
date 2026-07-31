---
id: docker-gitconfig-readonly-mount-ebusy
type: reference
title: "Docker: never bind-mount host gitconfig read-only onto the container global-config path (EBUSY)"
summary: Mounting ~/.gitconfig RO onto the container's global git-config path makes every `git config --global` / `gh auth setup-git` fail with 'Device or resource busy'; mount it at a non-global path and point GIT_CONFIG_GLOBAL at a writable include file instead.
tags:
  - docker
  - git
  - gitconfig
  - bind-mount
  - ci
  - containers
  - gh
embedding_version: 1
---

## Problem

When you bind-mount the host `~/.gitconfig` **read-only** onto the path git treats as the container's **global** config (`~/.gitconfig` for the container user), any tool that writes global git config fails:

```
error: could not lock config file /home/<user>/.gitconfig: Device or resource busy
```

Triggers include `git config --global ...`, `gh auth setup-git`, and any bootstrap step that seeds credentials globally. Symptoms are easy to misattribute: intermittent warnings, jobs that hit a turn/step limit "for no reason", and multi-minute hangs while git retries the busy lock. On Docker Desktop / Windows the RO bind is especially prone to the EBUSY lock.

## Why

A read-only bind mount cannot be `flock`ed for writing, and git/gh insist on locking the global config file before writing. The mount target being the *global* path means every global write is doomed, even though the intent was only to *read* host identity.

## Fix

Mount the host gitconfig read-only at a **non-global** path, and point `GIT_CONFIG_GLOBAL` at a **writable** file that `[include]`s the read-only one:

```
# docker run (illustrative)
--mount type=bind,source=<host>/.gitconfig,target=/etc/app/host.gitconfig,readonly
-e GIT_CONFIG_GLOBAL=/home/<user>/.gitconfig
```

Then seed the writable global file once at container start (idempotent; skip if the host file is absent):

```sh
touch "$GIT_CONFIG_GLOBAL"
grep -q 'host.gitconfig' "$GIT_CONFIG_GLOBAL" || \
  printf '[include]\n\tpath = /etc/app/host.gitconfig\n' >> "$GIT_CONFIG_GLOBAL"
```

Now host identity + `credential.helper` + `includeIf` are still inherited (read), while `git config --global` and `gh auth setup-git` write to the writable file without EBUSY.

Alternative (simpler, but loses host credential.helper/includeIf): drop the mount entirely and pass identity via `-e GIT_AUTHOR_NAME/EMAIL` + `GIT_COMMITTER_*`.

## Defense in depth

Have the actor that commits set identity **repo-locally** (`git config user.email ...` without `--global`, writing `<repo>/.git/config`, which is writable). Commits then succeed even if the global path is momentarily unwritable — but this only masks the EBUSY; fix the mount as above.
