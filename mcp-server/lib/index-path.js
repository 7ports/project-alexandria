'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Stable per-process instance tag derived from pid + a short env/hostname tag.
// Built once at module load time so it doesn't change within a process lifetime.
const _instanceId = _buildInstanceId();

function _buildInstanceId() {
  // Use pid + a short host-derived tag so two processes on the same box get distinct IDs.
  // We deliberately avoid Date.now() or Math.random() so the id is stable if the module
  // is required multiple times within the same process.
  const pid = process.pid;
  const hostTag = os.hostname().replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'local';
  return `${pid}-${hostTag}`;
}

// The Alexandria server package root (mcp-server/). Index files are a cache OF this package,
// so they live under it — never under process.cwd(). The server is registered globally and
// launched from whatever directory the client happens to be in; resolving against cwd would
// scatter `.index/` databases into unrelated repos (see concepts/globally-registered-process-cwd-trap).
const MODULE_ROOT = path.resolve(__dirname, '..');

/**
 * Resolve the sqlite database path for this process's local vector index.
 *
 * Topology-A safety: by default each process gets its own db file so concurrent
 * processes sharing one working tree never contend on the same SQLite file.
 * Pass shared:true only when a single shared db is explicitly desired (WAL mode
 * + app-level locking required by caller).
 *
 * NOTE: deliberately NOT wired into index-store.openIndex(), which keeps its own
 * module-anchored DEFAULT_DB_PATH. If it ever is wired in, the guard below keeps it safe.
 *
 * @param {object} [opts]
 * @param {string} [opts.baseDir='.index'] - Directory to create db files in, relative to
 *   mcp-server/ (NOT the process cwd). Absolute paths must still be inside mcp-server/.
 * @param {boolean} [opts.shared=false] - When true, return the shared db path
 * @returns {string} Absolute path to the db file
 * @throws when the resolved directory escapes mcp-server/
 */
function resolveIndexPath({ baseDir = '.index', shared = false } = {}) {
  const absBase = path.resolve(MODULE_ROOT, baseDir);
  assertUnderModuleRoot(absBase);

  // Ensure the directory exists (only after the guard, so a bad path never creates dirs).
  fs.mkdirSync(absBase, { recursive: true });

  const filename = shared
    ? 'knowledge.db'
    : `knowledge.${_instanceId}.db`;

  return path.join(absBase, filename);
}

/** Throw unless `absPath` is MODULE_ROOT itself or a descendant of it. */
function assertUnderModuleRoot(absPath) {
  const rel = path.relative(MODULE_ROOT, absPath);
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) return;
  throw new Error(
    `index-path: refusing index dir outside the Alexandria server package: ${absPath} ` +
      `(must be under ${MODULE_ROOT})`
  );
}

module.exports = { resolveIndexPath, assertUnderModuleRoot, MODULE_ROOT };
