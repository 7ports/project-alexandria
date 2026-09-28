#!/usr/bin/env node
/**
 * doctor.mjs — diagnose Alexandria's native read path.
 *
 * The semantic index rests on two native modules (better-sqlite3, sqlite-vec). When either
 * fails to load, search.js degrades to a substring scan and the server keeps answering, which
 * is the right runtime behaviour but a terrible diagnostic: every tool still returns text, so
 * the failure reads as "the knowledge base is empty" rather than "the index is down".
 *
 * This script makes the failure legible and names the remedy. Run it whenever a search result
 * carries the DEGRADED READ PATH banner:
 *
 *   npm run doctor
 *
 * Exits 0 when the semantic path is healthy, 1 when it is degraded.
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const problems = [];
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m, remedy) => {
  console.log(`  FAIL  ${m}`);
  problems.push({ m, remedy });
};

console.log('Alexandria doctor');
console.log(`  node ${process.version} on ${process.platform}/${process.arch}`);

// A node_modules tree built on a different OS is the single most common cause of a degraded
// read path here: a container and its host share a bind-mounted checkout, one of them runs
// `npm install`, and the other then loads binaries it cannot execute. npm resolves the
// platform-specific packages at install time, so the evidence is which of them is on disk.
const platformPkgs = fs
  .readdirSync(path.join(SERVER_DIR, 'node_modules'))
  .filter((d) => d.startsWith('sqlite-vec-'));
const expected = `sqlite-vec-${process.platform === 'win32' ? 'windows' : process.platform}-${process.arch}`;
if (platformPkgs.length === 0) {
  bad('no sqlite-vec platform package installed', 'run `npm install` in mcp-server/');
} else if (!platformPkgs.includes(expected)) {
  bad(
    `sqlite-vec platform packages on disk are ${platformPkgs.join(', ')} but this host needs ${expected}`,
    'node_modules was installed on a DIFFERENT platform (typically a container sharing the '
      + 'checkout). Delete mcp-server/node_modules and run `npm install` on the machine that '
      + 'runs the server. Keep node_modules out of any image build (.dockerignore).'
  );
} else {
  ok(`${expected} present`);
}

let Database = null;
try {
  Database = require('better-sqlite3');
  ok(`better-sqlite3 ${require('better-sqlite3/package.json').version} loads`);
} catch (err) {
  const msg = String(err && err.message);
  // "is not a valid Win32 application" / "invalid ELF header" = wrong-OS binary.
  // "NODE_MODULE_VERSION" = right OS, wrong Node ABI (no prebuild for this Node major).
  const wrongOs = /valid Win32 application|invalid ELF header|wrong ELF class|Mach-O/i.test(msg);
  const wrongAbi = /NODE_MODULE_VERSION|was compiled against a different/i.test(msg);
  bad(
    `better-sqlite3 does not load: ${msg}`,
    wrongOs
      ? 'the compiled binary is for another OS — reinstall node_modules on this machine'
      : wrongAbi
        ? `no prebuilt binary for Node ${process.version} — use a Node version this release ships `
          + 'prebuilds for, or upgrade better-sqlite3 (>=12.11.1 covers Node 20-26)'
        : 'reinstall with `npm install`; if it still fails, a source build needs a C++ toolchain'
  );
}

try {
  require('sqlite-vec');
  ok('sqlite-vec loads');
} catch (err) {
  bad(`sqlite-vec does not load: ${err.message}`, 'run `npm install` in mcp-server/');
}

if (Database) {
  try {
    const store = require('../lib/index-store').openIndex();
    ok('vector index opens');
    require('../lib/index-store').close(store);
  } catch (err) {
    bad(`vector index will not open: ${err.message}`, 'check .index/ permissions, then `npm run reindex`');
  }
}

console.log('');
if (problems.length === 0) {
  console.log('Semantic search is healthy.');
  process.exit(0);
}
console.log('DEGRADED: search_knowledge and recall_context are running a substring scan only,');
console.log('so a doc that covers a topic in different words will not be found. Remedies:');
for (const p of problems) console.log(`  - ${p.m}\n      ${p.remedy}`);
process.exit(1);
