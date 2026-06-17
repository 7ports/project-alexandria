import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Load the lib/ modules exactly as production does — through CommonJS require,
// so the local lib/package.json "type":"commonjs" semantics apply.
export const require = createRequire(import.meta.url);

let counter = 0;

/** Allocate a unique temp DB path under os.tmpdir(). Caller cleans it up. */
export function tmpDbPath() {
  counter += 1;
  return path.join(os.tmpdir(), `alexandria-test-${process.pid}-${counter}.db`);
}

/** Allocate a unique temp lock path under os.tmpdir(). */
export function tmpLockPath() {
  counter += 1;
  return path.join(os.tmpdir(), `alexandria-test-${process.pid}-${counter}.lock`);
}

/** Remove a sqlite db file plus its -wal / -shm sidecars, ignoring ENOENT. */
export function rmDb(dbPath) {
  for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* already gone */
    }
  }
}

/** Remove an arbitrary file, ignoring ENOENT. */
export function rmFile(p) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* already gone */
  }
}

/**
 * Build a deterministic, L2-normalized 384-dim vector that is "mostly" the
 * one-hot at `axis` with a little energy on a second axis. Lets index-store
 * tests assert nearest-neighbour ordering without touching the embedder.
 */
export function unitVec(axis, blend = 0) {
  const dim = 384;
  const v = new Array(dim).fill(0);
  v[axis % dim] = 1;
  if (blend) v[(axis + 1) % dim] = blend;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / norm);
}
