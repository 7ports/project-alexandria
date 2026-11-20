'use strict';

/**
 * content.js — the one definition of "what is a knowledge doc on disk".
 *
 * Every consumer that walks the content dirs (reindex, list_knowledge, the startup
 * self-heal hash, knowledge_health) goes through listContentFiles() so they can never
 * disagree about which files count. Two rules live here:
 *
 *   1. Directory placement decides the type. A file under concepts/ IS a concept, whatever
 *      its frontmatter says or omits. The frontmatter parser's `type: guide` default used to
 *      win for frontmatter-less files, so `search_knowledge {type:'concept'}` could not find
 *      docs that were sitting in concepts/.
 *   2. README.md is a directory description, not a knowledge doc. Each content dir has one,
 *      and with no frontmatter they all parsed to doc id `README` — three files overwriting
 *      one index row, surfacing as a phantom guide.
 *
 * CommonJS (see lib/package.json "type":"commonjs").
 */

const fs = require('fs');
const path = require('path');

// __dirname is mcp-server/lib → repo root is two levels up.
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const TYPE_DIRS = {
  guide: 'guides',
  concept: 'concepts',
  article: 'articles',
  reference: 'references',
};
const DIR_TYPES = Object.fromEntries(Object.entries(TYPE_DIRS).map(([t, d]) => [d, t]));
const CONTENT_DIRS = Object.values(TYPE_DIRS);

function dirForType(type) {
  return TYPE_DIRS[type] || TYPE_DIRS.guide;
}

/** Type implied by a content dir; accepts a bare name or a path ending in one. */
function typeForDir(dir) {
  return DIR_TYPES[path.basename(String(dir || ''))] || 'guide';
}

/** True for a markdown file that is a knowledge doc (not the dir's README). */
function isContentFile(filename) {
  return /\.md$/i.test(filename) && filename.toLowerCase() !== 'readme.md';
}

/**
 * Every knowledge doc under the given content dirs (missing dirs are skipped).
 * @param {{ contentDirs?: string[], repoRoot?: string }} [opts] - dirs are repo-root-relative
 *   (or absolute, which tests use to point at a temp tree)
 * @returns {Array<{ relPath: string, absPath: string, dir: string, filename: string,
 *   slug: string, type: string }>}
 */
function listContentFiles(opts = {}) {
  const contentDirs = opts.contentDirs || CONTENT_DIRS;
  const repoRoot = opts.repoRoot || REPO_ROOT;
  const out = [];
  for (const dir of contentDirs) {
    const absDir = path.resolve(repoRoot, dir);
    let entries;
    try {
      entries = fs.readdirSync(absDir);
    } catch {
      continue; // dir does not exist yet
    }
    for (const f of entries.sort()) {
      if (!isContentFile(f)) continue;
      out.push({
        relPath: `${dir}/${f}`,
        absPath: path.join(absDir, f),
        dir,
        filename: f,
        slug: f.replace(/\.md$/i, ''),
        type: typeForDir(dir),
      });
    }
  }
  return out;
}

module.exports = {
  REPO_ROOT,
  TYPE_DIRS,
  DIR_TYPES,
  CONTENT_DIRS,
  dirForType,
  typeForDir,
  isContentFile,
  listContentFiles,
};
