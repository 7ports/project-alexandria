'use strict';

/**
 * git-sync.js — result-aware, retried commit+push for the Alexandria knowledge
 * write path. Generalizes the original fire-and-forget `gitCommitAndPush`
 * (mcp-server/index.js) into a reusable, per-tree-locked sync that works for
 * ALL content dirs (guides/ concepts/ articles/ references/).
 *
 * Sequence (under the per-tree lock):
 *   git add <relPath> -> git commit
 *   retry loop (<= maxRetries, jittered backoff):
 *     git fetch origin + git rebase origin/<branch>  -> git push
 *   on a push rejection (non-fast-forward / fetch-first): a peer advanced the
 *     branch in our race window -> back off, re-loop (re-fetch + re-rebase).
 *   on a REBASE CONFLICT: abort the rebase, set a sync_conflict flag, log a loud
 *     warning naming the file, leave our commit on the local branch, and STOP.
 *     We never overwrite a peer's commit (no destructive push), so a genuine
 *     same-file concurrent edit surfaces to a human instead of being clobbered.
 *
 * Design refs: alexandria-sync-and-boundary-addendum.md → "Write Path
 * (pull-rebase-push)". CommonJS (see lib/package.json "type":"commonjs").
 */

const { execFile } = require('child_process');
const path = require('path');
const { withLock } = require('./sync-lock');
const {
  incSyncRetry,
  incSyncFailure,
  incSyncConflict,
  setLastSyncAge,
} = require('./metrics-hooks');

// __dirname is mcp-server/lib → repo root is two levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Process-wide sync health, surfaced for a health/status tool. `sync_conflict`
 * is raised when a same-file concurrent edit needs human reconciliation.
 */
const syncState = {
  sync_conflict: false,
  conflict_file: null,
  last_sync_ok: null,
};

function gitExec(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: cwd || REPO_ROOT }, (error, stdout, stderr) => {
      if (error) {
        const e = new Error(`git ${args[0]} failed: ${stderr || error.message}`);
        e.stdout = stdout;
        e.stderr = stderr;
        reject(e);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function currentBranch(cwd) {
  const { stdout } = await gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const branch = stdout.trim();
  // Fail loudly instead of guessing a branch name. An empty result or a detached
  // HEAD ("HEAD") must NOT silently fall back to "main" — that reintroduces the
  // exact hardcoded-main durability bug T1 removed. Callers surface this reason.
  if (!branch || branch === 'HEAD') {
    throw new Error(
      `cannot resolve current branch (git returned "${branch || '<empty>'}"); ` +
        'refusing to guess a branch to push to'
    );
  }
  return branch;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Jittered exponential backoff: ~0.5s, 1s, 2s, 4s, 8s (+ up to 50% jitter). */
function backoffMs(attempt) {
  const base = 500 * Math.pow(2, attempt - 1);
  return Math.round(base + Math.random() * base * 0.5);
}

function isNonFastForward(err) {
  const msg = String((err && (err.stderr || err.message)) || '');
  return /non-fast-forward|fetch first|\(fetch-first\)|rejected|behind|stale info/i.test(msg);
}

/**
 * Stage, commit, then rebase-and-push `relPath` with retries, all under a
 * per-tree advisory lock. Async/non-blocking-friendly: callers may fire it off
 * without awaiting (the local file + index are already correct by then).
 *
 * @param {string} relPath  - repo-root-relative path to the changed file
 * @param {string} message  - commit message
 * @param {{ lockPath?: string, maxRetries?: number, noGit?: boolean, cwd?: string }} [opts]
 * @returns {Promise<{ committed: boolean, pushed: boolean, sync_conflict?: boolean,
 *                      attempts?: number, reason?: string, error?: string }>}
 */
async function syncCommitAndPush(relPath, message, opts = {}) {
  const {
    lockPath = '.git/alexandria-sync.lock',
    maxRetries = 5,
    noGit = false,
    cwd = REPO_ROOT,
  } = opts;

  // Test / no-network mode: skip every git invocation entirely.
  if (noGit) {
    return { committed: false, pushed: false, reason: 'no-git' };
  }

  const absLock = path.isAbsolute(lockPath) ? lockPath : path.resolve(cwd, lockPath);

  return withLock(absLock, async () => {
    // 1. Stage + commit. "nothing to commit" is a no-op success.
    try {
      await gitExec(['add', relPath], cwd);
      await gitExec(['commit', '-m', message], cwd);
    } catch (err) {
      const blob = `${err.message || ''}${err.stdout || ''}${err.stderr || ''}`;
      if (/nothing to commit|no changes added/i.test(blob)) {
        return { committed: false, pushed: false, reason: 'nothing-to-commit' };
      }
      console.error(`[alexandria] git add/commit failed: ${err.message}`);
      return { committed: false, pushed: false, error: err.message };
    }

    // Resolve the target branch dynamically. On failure we STOP loudly rather
    // than defaulting to any branch name — a wrong-branch push is worse than no
    // push (it can land the commit on the wrong ref). The commit is already
    // local, so it propagates on the next successful sync.
    let branch;
    try {
      branch = await currentBranch(cwd);
    } catch (err) {
      console.error(`[alexandria] cannot resolve branch for push: ${err.message}`);
      return {
        committed: true,
        pushed: false,
        remote: 'origin',
        reason: 'branch-unresolved',
        error: err.message,
      };
    }

    // 2. Rebase-onto-remote then push, retrying on a racing peer push.
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await gitExec(['fetch', 'origin'], cwd);
      } catch (err) {
        // Offline / no remote: keep the local commit; it propagates next sync.
        console.error(`[alexandria] git fetch failed (saved locally, will sync later): ${err.message}`);
        return { committed: true, pushed: false, branch, remote: 'origin', reason: 'fetch-failed', error: err.message };
      }

      try {
        // --autostash: this tree is essentially ALWAYS dirty with files unrelated
        // to the one we just committed (a session hook rewrites .beads/config.yaml
        // and Dockerfile.voltron on every session). Plain `git rebase` refuses to
        // run against a dirty tree, so the push never happened. --autostash makes
        // git stash those unrelated changes, rebase, then restore them — and it
        // restores them on `rebase --abort` too (see the conflict path below), so
        // the user's dirty files are byte-identical whether we succeed OR fail,
        // and no manual stash/pop can lose them.
        await gitExec(['rebase', '--autostash', `origin/${branch}`], cwd);
      } catch (rebaseErr) {
        // REBASE CONFLICT → abort, never overwrite the peer's commit, leave our
        // commit local, raise the health flag, and log a loud, named warning.
        try {
          await gitExec(['rebase', '--abort'], cwd);
        } catch (_) {
          /* best-effort abort */
        }
        syncState.sync_conflict = true;
        syncState.conflict_file = relPath;
        incSyncConflict();
        console.error(
          `[alexandria] ⚠️  SYNC CONFLICT on "${relPath}": rebase aborted. ` +
            `The doc is saved and committed LOCALLY but was NOT pushed (we never ` +
            `overwrite a peer's commit). A concurrent same-file edit needs manual ` +
            `reconciliation by an operator.`
        );
        return { committed: true, pushed: false, branch, remote: 'origin', sync_conflict: true, reason: 'rebase-conflict' };
      }

      try {
        await gitExec(['push', 'origin', branch], cwd);

        // Wrong-ref guard: confirm the push actually advanced the remote branch
        // to OUR HEAD. If the remote-tracking ref does not match HEAD, the push
        // did not land where we expect (e.g. a racing force-update) — report a
        // failure instead of a false success.
        let headSha;
        let remoteSha;
        try {
          headSha = (await gitExec(['rev-parse', 'HEAD'], cwd)).stdout.trim();
          remoteSha = (await gitExec(['rev-parse', `refs/remotes/origin/${branch}`], cwd)).stdout.trim();
        } catch (verifyErr) {
          incSyncFailure();
          console.error(`[alexandria] push verification failed for "${relPath}": ${verifyErr.message}`);
          return { committed: true, pushed: false, branch, remote: 'origin', reason: 'push-verify-failed', error: verifyErr.message };
        }
        if (headSha !== remoteSha) {
          incSyncFailure();
          console.error(
            `[alexandria] ⚠️  push landed on the wrong ref for "${relPath}" on ${branch}: ` +
              `remote origin/${branch}=${remoteSha} != local HEAD=${headSha}. Reporting NOT pushed.`
          );
          return {
            committed: true,
            pushed: false,
            branch,
            remote: 'origin',
            reason: 'push-ref-mismatch',
            error: `remote ref ${remoteSha} does not match HEAD ${headSha}`,
          };
        }

        syncState.last_sync_ok = Date.now();
        setLastSyncAge(syncState.last_sync_ok);
        syncState.sync_conflict = false;
        syncState.conflict_file = null;
        return { committed: true, pushed: true, branch, remote: 'origin', attempts: attempt };
      } catch (pushErr) {
        // Non-fast-forward: a peer pushed between our fetch and push. Back off
        // and re-loop — the next iteration re-fetches and re-rebases on top.
        if (isNonFastForward(pushErr) && attempt < maxRetries) {
          incSyncRetry();
          await sleep(backoffMs(attempt));
          continue;
        }
        if (attempt >= maxRetries) {
          incSyncFailure();
          console.error(
            `[alexandria] git push failed after ${maxRetries} attempts ` +
              `(knowledge saved locally + committed; will sync on next write/refresh): ${pushErr.message}`
          );
          return { committed: true, pushed: false, branch, remote: 'origin', reason: 'max-retries', error: pushErr.message };
        }
        console.error(`[alexandria] git push failed (saved locally): ${pushErr.message}`);
        return { committed: true, pushed: false, branch, remote: 'origin', error: pushErr.message };
      }
    }

    return { committed: true, pushed: false, branch, remote: 'origin', reason: 'exhausted' };
  });
}

module.exports = { syncCommitAndPush, syncState };
