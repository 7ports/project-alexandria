'use strict';

const fs = require('fs');

/**
 * Cross-process advisory lock for serializing git/index operations within one host.
 *
 * Uses O_EXCL atomic file creation so only one process can hold the lock at a time.
 * Stale locks (older than staleMs, or whose pid is no longer alive) are broken and
 * re-acquired. Always releases in a finally block.
 *
 * @param {string} lockPath - Path to the lockfile (e.g. .git/alexandria-sync.lock)
 * @param {() => Promise<any>} fn - Async function to run while holding the lock
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=15000] - Max ms to wait before giving up
 * @param {number} [opts.staleMs=60000] - Age in ms after which a lock is considered stale
 * @returns {Promise<any>} Result of fn
 */
async function withLock(lockPath, fn, { timeoutMs = 15000, staleMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  const pidStr = String(process.pid);

  while (true) {
    const acquired = await _tryAcquire(lockPath, pidStr, staleMs);
    if (acquired) {
      try {
        return await fn();
      } finally {
        _release(lockPath);
      }
    }

    if (Date.now() >= deadline) {
      throw new Error(`sync-lock: timed out after ${timeoutMs}ms waiting for ${lockPath}`);
    }

    // Small jittered backoff: 50–100 ms
    await _sleep(50 + Math.floor(Math.random() * 50));
  }
}

/**
 * Attempt to atomically create the lockfile.
 * Returns true if acquired, false if held by a live process.
 * Breaks a stale lock (by pid death or age) and re-tries once.
 */
async function _tryAcquire(lockPath, pidStr, staleMs) {
  // First attempt: atomic O_EXCL create
  const written = await _atomicCreate(lockPath, pidStr);
  if (written) return true;

  // Lock exists — check if it's stale
  let existing;
  try {
    existing = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (_) {
    // File vanished between our check and read, or unreadable — retry next iteration
    return false;
  }

  const isStaleByAge = (Date.now() - (existing.ts || 0)) > staleMs;
  const isStaleByPid = existing.pid != null && !_isPidAlive(existing.pid);

  if (isStaleByAge || isStaleByPid) {
    // Break the stale lock: unlink then try once more atomically
    try {
      fs.unlinkSync(lockPath);
    } catch (_) {
      // Another process may have beat us to the unlink — that's fine
      return false;
    }
    return await _atomicCreate(lockPath, pidStr);
  }

  return false;
}

/**
 * Atomically create lockfile using O_EXCL (fails if already exists).
 * Returns true on success, false if the file already exists.
 */
function _atomicCreate(lockPath, pidStr) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ pid: process.pid, ts: Date.now() });
    fs.open(lockPath, 'wx', (err, fd) => {
      if (err) {
        // EEXIST means lock is held — expected
        resolve(false);
        return;
      }
      fs.write(fd, payload, (writeErr) => {
        fs.close(fd, () => resolve(!writeErr));
      });
    });
  });
}

/**
 * Release the lock by unlinking the lockfile. Errors are swallowed — if the file
 * is already gone (e.g. stale-breaker on another process) there's nothing to do.
 */
function _release(lockPath) {
  try {
    fs.unlinkSync(lockPath);
  } catch (_) {
    // Already gone — fine
  }
}

/**
 * Check whether a pid is alive on this host using signal 0 (no signal sent, just checks).
 */
function _isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { withLock };
