/**
 * frontmatter.js — minimal YAML frontmatter parser for Alexandria docs.
 *
 * Parses a leading `--- ... ---` block into a flat `meta` object and returns
 * the remaining markdown as `body`. Intentionally dependency-free: it handles
 * only the subset of YAML the content schema uses (flat scalars, inline and
 * block lists, folded/literal scalars) — NOT arbitrary YAML.
 *
 * Backward-compatible: a file with no frontmatter is treated as a guide, with
 * `id` derived from the filename and `title` from the first `# H1`, so the
 * existing un-migrated guides index correctly.
 *
 * This file is CommonJS (see lib/package.json `"type": "commonjs"`).
 *
 * Schema keys handled: id, type, title, summary, tags[], status, created,
 * updated, source_urls[], supersedes, embedding_version.
 */

/**
 * @typedef {Object} DocMeta
 * @property {string} id
 * @property {string} type   - guide | concept | article | reference
 * @property {string} title
 * @property {string} [summary]
 * @property {string[]} [tags]
 * @property {string} [status]
 * @property {string} [created]
 * @property {string} [updated]
 * @property {string[]} [source_urls]
 * @property {string|null} [supersedes]
 * @property {number} [embedding_version]
 */

/**
 * Parse leading YAML frontmatter from a markdown string.
 * @param {string} markdown
 * @param {string} [filename] - used to derive the default `id` slug
 * @returns {{ meta: DocMeta, body: string }}
 */
function parseFrontmatter(markdown, filename) {
  const text = String(markdown == null ? '' : markdown).replace(/^﻿/, '');
  const block = extractBlock(text);

  let meta;
  let body;
  if (block) {
    meta = parseYaml(block.yaml);
    body = block.body;
  } else {
    meta = {};
    body = text;
  }

  // Defaults — keep the parser backward-compatible with un-migrated docs and
  // resilient to frontmatter that omits a required key.
  if (!meta.type) meta.type = 'guide';
  if (!meta.id) meta.id = slugFromFilename(filename);
  if (!meta.title) meta.title = firstH1(body) || meta.id;

  return { meta, body };
}

/**
 * Detect and split a leading `--- ... ---` frontmatter block.
 * @returns {{ yaml: string, body: string } | null}
 */
function extractBlock(text) {
  // Frontmatter must open on the very first line with `---`.
  if (!/^---[ \t]*\r?\n/.test(text)) return null;

  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) return null; // no closing fence → treat as no frontmatter

  const yaml = lines.slice(1, end).join('\n');
  // Drop a single blank line immediately after the closing fence.
  const body = lines.slice(end + 1).join('\n').replace(/^\r?\n/, '');
  return { yaml, body };
}

/**
 * Parse the subset of YAML used by the content schema.
 * @param {string} src
 * @returns {Object}
 */
function parseYaml(src) {
  const meta = {};
  const lines = src.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    // Only top-level `key: value` lines (no leading indentation) start a key.
    const m = line.match(/^([A-Za-z0-9_]+):[ \t]*(.*)$/);
    if (!m) {
      i++;
      continue;
    }

    const key = m[1];
    const rest = m[2].trim();

    // Folded (`>`) / literal (`|`) block scalar — collect indented lines.
    if (/^[|>][+-]?$/.test(rest)) {
      const collected = [];
      i++;
      while (i < lines.length && (/^[ \t]+/.test(lines[i]) || lines[i].trim() === '')) {
        collected.push(lines[i].trim() === '' ? '' : lines[i].replace(/^[ \t]+/, ''));
        i++;
      }
      const sep = rest[0] === '>' ? ' ' : '\n';
      meta[key] = collected.join(sep).trim();
      continue;
    }

    // Empty value → maybe a block list on the following indented `- ` lines.
    if (rest === '') {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^[ \t]+-[ \t]*/.test(lines[j])) {
        items.push(parseScalar(lines[j].replace(/^[ \t]+-[ \t]*/, '')));
        j++;
      }
      if (items.length) {
        meta[key] = items.filter((v) => v !== null && v !== '');
        i = j;
        continue;
      }
      meta[key] = null;
      i++;
      continue;
    }

    meta[key] = parseScalar(rest);
    i++;
  }

  return meta;
}

/**
 * Coerce a single scalar value: inline list, quoted string, null, number, or
 * plain string.
 * @param {string} raw
 * @returns {string|number|null|Array}
 */
function parseScalar(raw) {
  let v = raw.trim();

  // Inline list: [a, b, c]
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((s) => stripQuotes(s.trim()))
      .filter((s) => s !== '');
  }

  v = stripQuotes(v);
  if (v === '' || v === 'null' || v === '~') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  return v;
}

function stripQuotes(s) {
  if (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * First `# H1` heading text in the body, or null. Ignores `##`+ headings.
 * @param {string} body
 * @returns {string|null}
 */
function firstH1(body) {
  const lines = String(body).split(/\r?\n/);
  for (const l of lines) {
    const m = l.match(/^#[ \t]+(.+?)\s*$/);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * Filename → stable slug: basename without the `.md` extension.
 * @param {string} [filename]
 * @returns {string}
 */
function slugFromFilename(filename) {
  if (!filename) return 'untitled';
  const base = String(filename).split(/[\\/]/).pop();
  return base.replace(/\.md$/i, '');
}

module.exports = { parseFrontmatter };
