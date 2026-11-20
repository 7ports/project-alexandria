---
id: globally-registered-process-cwd-trap
type: concept
title: "Globally-registered servers must anchor paths to the module, never process.cwd()"
summary: A server registered once and launched from arbitrary working directories will scatter or lose data if any path resolves from process.cwd(). Anchor to the module location and assert it.
tags:
  - mcp
  - path-resolution
  - process-cwd
  - data-loss
  - node
  - server-design
status: active
embedding_version: 1
---

## The trap

A server is registered **once, globally** (an MCP server in a user-level config, a language server, a background daemon, a git hook helper). The client then launches it with the working directory set to *whatever project the user happens to be in* — not the server's own repository.

Any path the server resolves from `process.cwd()` therefore points somewhere different on every launch. For a server whose whole job is to persist data into its own repo, this is silent data loss: writes land in an unrelated project's directory tree, and the canonical store looks like the write simply never happened.

## Why it is easy to get wrong

During development, `cwd` *is* the server's repo. Every test passes. The bug only appears once the server is registered globally and used from elsewhere — which is exactly when it stops being observed closely.

Worse, the trap is often **latent**: a helper like `resolveDataDir()` that reads `process.cwd()` sits in the codebase with zero callers, having been written for a plausible future need. It looks harmless. It is one wiring-up away from scattering state across every repo on the machine.

An especially bad variant is a resolver that **eagerly creates** the directory as a side effect of resolution (`mkdirSync` inside the getter). Merely *calling* it litters the current project with an empty state directory. That also makes forensics confusing later: you find orphaned, empty state dirs in unrelated repos and cannot tell whether they represent lost writes or just probe artifacts.

## The rule

**Anchor to the module, not the process.**

```js
// Node ESM
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '.index');      // stable regardless of cwd

// Node CJS
const DATA_DIR = require('node:path').join(__dirname, '.index');
```

Then hold the line:

- **Never use `process.cwd()` for anything the server owns.** Reserve it strictly for interpreting a path the *user* just typed, where relative-to-their-cwd is the intended semantics.
- **Never resolve paths as a side-effecting getter.** Resolution must be pure; create directories at an explicit initialization step.
- **Delete cwd-relative resolvers you are not using.** An unwired landmine is still a landmine. If you must keep one, make it take an explicit base directory as a required argument so it cannot silently read the ambient cwd.
- **Assert it in a test.** The check is cheap and it is the only thing that actually prevents regression:

```js
// resolve the default data path from two different cwds; they must match
const a = childProcess.execFileSync(node, [probe], { cwd: os.tmpdir() });
const b = childProcess.execFileSync(node, [probe], { cwd: repoRoot });
assert.equal(a.toString(), b.toString());
```

- **Prefer explicit configuration over inference** for anything a user might legitimately want to relocate — an env var or config key beats guessing from the environment.

## Diagnosing it in the wild

Symptom: reads work and look plausible, but writes performed from *some* sessions are missing. Correlate the missing writes with which directory the user was working in at the time — if that correlates, this is your bug.

Search for the pattern directly rather than reasoning about it:

```
grep -rn "process\.cwd()" --include=*.js --include=*.ts .
```

Then, for each hit, ask: *would this still be correct if the process were launched from a random directory?* Also sweep the filesystem for orphaned copies of your state directory outside the repo — their presence tells you the resolver has already run somewhere it should not have.

## Related

The same reasoning applies to config discovery that walks up from `cwd`, to lockfile placement, and to any "find the project root" heuristic in a globally-installed tool. See also [[write-path-durability-must-be-loud]].
