'use strict';

/**
 * refresh.js — TTL refresh-on-read for the Alexandria knowledge base.
 *
 * A long-running instance only pulls peers' writes as a side effect of its own
 * writes (git-sync.js) or at boot (startup self-heal). That lets it drift for
 * hours. This module closes that gap with the addendum's "Freshness &
 * Reconciliation" primary trigger:
 *
 *   - maybeRefresh()    cheap, synchronous gate called on every READ. If the
 *                       last successful sync is older than the TTL it kicks a
 *                       NON-BLOCKING background refresh and returns immediately,
 *                       so the query is never blocked on the network. An
 *                       in-flight guard stops concurrent reads from stacking
 *                       refreshes.
 *   - refreshFromRemote() the background work: under the per-tree lock, fetch
 *                       origin + ff-merge (or rebase if we have local commits),
 *                       then incrementally reconcileIndex() only the docs that
 *                       actually changed, and stamp lastSyncOk.
 *
 * CommonJS (see lib/package.json "type":"commonjs"); loaded from the ESM
 * index.js via createRequire, alongside reindex.js / sync-lock.js.
 *
 * Design refs: alexandria-sync-and-boundary-addendum.md → "Freshness &
 * Reconciliation" (TTL refresh-on-read, refreshFromRemote, Phase 4a).
 */

const { execFile } = require('child_process');
const path = require('path');

const { withLock } = require('./sync-lock');
const { reconcileIndex } = require('./reindex');

// __dirname is mcp-server/lib → repo root is two levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Module-level sync state. `lastSyncOk` is the epoch-ms timestamp of the last
// successful sync; reads compare against it to decide whether to refresh.
// `refreshInFlight` is the guard that prevents concurrent reads from stacking
// background refreshes on top of one another.
// ---------------------------------------------------------------------------
let lastSyncOk = 0;
let refreshInFlight = false;

function getLastSyncOk() {
  return lastSyncOk;
}

function setLastSyncOk(ts) {
  lastSyncOk = Number(ts) || 0;
  return lastSyncOk;
}

/**
 * Cheap synchronous gate run on every read. Decides whether the index is stale
 * enough to warrant a background refresh — and if so, fires `trigger()`
 * fire-and-forget and returns IMMEDIATELY. Never awaits the trigger, so the
 * caller's query always serves the current index without a network round-trip.
 *
 *  - 'fresh'     last sync is within the TTL → nothing to do.
 *  - 'in-flight' stale, but a refresh kicked by an earlier read is still running
 *                → don't stack a second one.
 *  - 'triggered' stale and idle → trigger() was called (background) this tick.
 *
 * @param {{ ttlMs: number, now: number, trigger: () => any }} args
 * @returns {'fresh'|'in-flight'|'triggered'}
 */
function maybeRefresh({ ttlMs, now, trigger }) {
  const age = now - lastSyncOk;

  // Within the TTL: serve as-is regardless of any in-flight refresh.
  if (age <= ttlMs) return 'fresh';

  // Stale, but a background refresh is already running — don't stack another.
  if (refreshInFlight) return 'in-flight';

  // Stale and idle: kick the background refresh fire-and-forget, clearing the
  // guard whenever it settles (handles both sync and async triggers).
  refreshInFlight = true;
  try {
    const ret = typeof trigger === 'function' ? trigger() : undefined;
    Promise.resolve(ret).then(
      () => { refreshInFlight = false; },
      () => { refreshInFlight = false; }
    );
  } catch (_) {
    // A synchronous throw from trigger must not wedge the guard permanently.
    refreshInFlight = false;
  }
  return 'triggered';
}

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
  return stdout.trim() || 'main';
}

/**
 * The background refresh kicked by maybeRefresh. Under the per-tree advisory
 * lock (shared with the write path so a fetch never interleaves a rebase):
 *
 *   git fetch origin <branch>
 *   if origin/<branch> == HEAD → nothing new, cheapest path
 *   else: ff-merge it, OR rebase our local commits onto it if we have any
 *   reconcileIndex() the docs that actually changed (incremental re-embed)
 *   stamp lastSyncOk = now
 *
 * With noGit:true it is a no-op success (test / no-network mode) that still
 * stamps lastSyncOk so the TTL gate advances.
 *
 * @param {{ store?: object, branch?: string, noGit?: boolean, cwd?: string }} [opts]
 * @returns {Promise<{ ok: boolean, reason?: string, reconciled?: number }>}
 */
async function refreshFromRemote({ store, branch, noGit = false, cwd = REPO_ROOT } = {}) {
  if (noGit) {
    setLastSyncOk(Date.now());
    return { ok: true, reason: 'no-git', reconciled: 0 };
  }

  const absLock = path.resolve(cwd, '.git/alexandria-sync.lock');

  return withLock(absLock, async () => {
    const br = branch || (await currentBranch(cwd).catch(() => 'main'));

    const before = (await gitExec(['rev-parse', 'HEAD'], cwd)).stdout.trim();

    try {
      await gitExec(['fetch', 'origin', br], cwd);
    } catch (err) {
      // Offline / no remote: the local index is still correct; try again next TTL.
      console.error(`[alexandria] refresh fetch failed (serving local index): ${err.message}`);
      return { ok: false, reason: 'fetch-failed', reconciled: 0 };
    }

    const remote = (await gitExec(['rev-parse', `origin/${br}`], cwd)).stdout.trim();
    if (remote === before) {
      // Nothing new on the remote — cheapest path, just advance the TTL.
      setLastSyncOk(Date.now());
      return { ok: true, reason: 'up-to-date', reconciled: 0 };
    }

    // If we have local commits not yet on the remote, replay them on top
    // (rebase); otherwise a clean fast-forward merge suffices.
    let ahead = '0';
    try {
      ahead = (await gitExec(['rev-list', '--count', `origin/${br}..HEAD`], cwd)).stdout.trim();
    } catch (_) {
      ahead = '0';
    }

    try {
      if (ahead !== '0') {
        await gitExec(['rebase', `origin/${br}`], cwd);
      } else {
        await gitExec(['merge', '--ff-only', `origin/${br}`], cwd);
      }
    } catch (err) {
      // A conflicting rebase/merge is a same-doc concurrent edit — leave it for
      // the write path's conflict handling; never auto-resolve here.
      try { await gitExec(['rebase', '--abort'], cwd); } catch (_) { /* best-effort */ }
      console.error(`[alexandria] refresh merge/rebase failed: ${err.message}`);
      return { ok: false, reason: 'merge-failed', reconciled: 0 };
    }

    const after = (await gitExec(['rev-parse', 'HEAD'], cwd)).stdout.trim();

    let reconciled = 0;
    if (after !== before && store) {
      const { stdout } = await gitExec(['diff', '--name-only', `${before}..${after}`], cwd);
      const changedPaths = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
      if (changedPaths.length) {
        const res = await reconcileIndex(store, changedPaths);
        reconciled = (res.reembedded || 0) + (res.deleted || 0);
      }
    }

    setLastSyncOk(Date.now());
    return { ok: true, reconciled };
  });
}

module.exports = {
  getLastSyncOk,
  setLastSyncOk,
  maybeRefresh,
  refreshFromRemote,
};
