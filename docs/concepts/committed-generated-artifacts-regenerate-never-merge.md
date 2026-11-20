---
id: committed-generated-artifacts-regenerate-never-merge
type: concept
title: "Generated artifacts committed to git must be regenerated on conflict, never side-selected"
summary: "Derived files checked into a repo conflict on every parallel branch. Picking --ours or --theirs commits an artifact that matches neither branch's source. Regenerate after the merge, and beware that a conflicting PR silently stops pull_request CI from running at all."
tags:
  - git
  - merge-conflict
  - ci
  - generated-artifacts
  - build-outputs
  - github-actions
  - drift-detection
status: active
embedding_version: 1
---

## The situation

A repo commits **derived** files — a search index, embedding vectors, a bundled asset, a generated manifest, an OpenAPI spec, a lockfile-like snapshot. They are checked in because something downstream (a static site, a CI gate, a consumer without a build step) needs them present without running the generator.

The moment two branches both touch the source corpus, both regenerate the artifact, and the artifact conflicts. This happens constantly and is usually "resolved" wrongly.

## The trap: resolving by side-selection

The reflex is `git checkout --ours` / `--theirs`, or a merge strategy like `-X ours`. For a *derived* file this is **always wrong**, and wrong in a way that looks fine:

- `--ours` gives you an artifact built from *your* branch's sources — which no longer describes the merged corpus, because the merge just pulled in their source changes too.
- `--theirs` gives the mirror-image error.
- The merge commits cleanly, the diff looks plausible, and nothing complains until a drift gate fires later — or worse, until a consumer silently serves stale data.

**The correct resolution is to regenerate.** After the merge of the *source* files completes, run the generator against the merged tree and commit its output. The correct artifact may equal neither side.

```bash
git merge origin/main                 # sources merge; artifacts conflict
# resolve the SOURCE conflicts on their merits first, then:
npm run build:artifacts               # or whatever CI runs
git add <artifact paths>
git commit
```

Mirror **exactly** what CI runs to produce them — same command, same flags, same preceding index/build step. If CI does a full forced rebuild before generating, do that too; a warm or partial rebuild can emit a subtly different artifact that fails a byte-comparison gate.

## The second trap: a conflicting PR silently disables its own CI

This one costs real time. On GitHub, workflows triggered by `pull_request` run against a **synthetic merge commit** of the head and base branches. If the PR has conflicts, that merge commit cannot be computed — so those workflows **do not run at all**.

The failure mode is that the checks simply *disappear* from the PR rather than reporting red. If some of your jobs are `push`-triggered and others are `pull_request`-triggered, you see a partial, all-green check list and conclude things are fine, when the most important gate never executed.

Practical rules:
- When checks vanish between runs, suspect a conflict before suspecting the workflow.
- Compare the check list against the set of jobs you *expect*; do not just look for red.
- Reconcile the conflict first — CI cannot tell you anything until you do.
- Know which of your jobs are `push`- vs `pull_request`-triggered, because they cover different things and fail differently.

## Why a drift gate is worth having anyway

A CI job that rebuilds the artifact and byte-compares it against the committed copy (`--check` style) is the thing that catches all of this. It will feel obstructive — it fires whenever someone adds source material without regenerating — but each firing is a genuine "the committed artifact no longer matches its inputs."

Two design notes:
- **Report counts, not just pass/fail.** "48 vs 44 rows, 661 vs 657 chunks" localises the problem instantly; "artifacts differ" sends you reading diffs of a binary.
- **Watch for the regenerate-but-never-commit-back leak.** A common half-fix is a deploy pipeline that regenerates the artifact into its *deploy output* but never commits it to the repo. The published result is correct while the committed copy drifts further every release — so anyone reading from a clone (including automated consumers) gets stale data indefinitely, and it never shows up as a failure.

## The standing question

Every committed artifact is a cache with no invalidation. Before adding one, ask whether the consumer can build it instead. If it must be committed, pair it with a drift gate on day one — an artifact with no gate will be stale and nobody will know.

## Related

See also [[write-path-durability-must-be-loud]] for the general principle that a silent success is worse than a loud failure.
