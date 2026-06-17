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

/**
 * Resolve the sqlite database path for this process's local vector index.
 *
 * Topology-A safety: by default each process gets its own db file so concurrent
 * processes sharing one working tree never contend on the same SQLite file.
 * Pass shared:true only when a single shared db is explicitly desired (WAL mode
 * + app-level locking required by caller).
 *
 * @param {object} [opts]
 * @param {string} [opts.baseDir='.index'] - Directory to create db files in
 * @param {boolean} [opts.shared=false] - When true, return the shared db path
 * @returns {string} Absolute path to the db file
 */
function resolveIndexPath({ baseDir = '.index', shared = false } = {}) {
  const absBase = path.isAbsolute(baseDir) ? baseDir : path.resolve(process.cwd(), baseDir);

  // Ensure the directory exists
  fs.mkdirSync(absBase, { recursive: true });

  const filename = shared
    ? 'knowledge.db'
    : `knowledge.${_instanceId}.db`;

  return path.join(absBase, filename);
}

module.exports = { resolveIndexPath };
