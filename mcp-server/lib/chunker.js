/**
 * chunker.js — structure-aware markdown chunking for Alexandria's vector index.
 *
 * Splits a parsed doc ({ meta, body }) into embedding-friendly chunks:
 *
 *  1. The frontmatter `summary` (if present) is emitted as its own standalone
 *     chunk — a strong hit for broad "what do we know about X" queries.
 *  2. For `type: guide`, the `## Quick Reference` section is emitted as its own
 *     chunk so semantic search can surface install commands directly.
 *  3. Remaining content is split on markdown headings (`##`/`###`/…), preserving
 *     a `heading_path` (e.g. `Troubleshooting > Windows`).
 *  4. Long sections are packed to ~512 tokens/chunk with ~64-token overlap,
 *     approximated by characters (~2000 chars, ~256 overlap).
 *  5. Fenced code blocks (```/~~~) are NEVER split across chunks; a code block
 *     longer than the target becomes its own chunk.
 *
 * This file is CommonJS (see lib/package.json `"type": "commonjs"`).
 */

// Character approximations of the ~512-token target / ~64-token overlap.
const MAX_CHARS = 2000;
const OVERLAP_CHARS = 256;

/**
 * @typedef {Object} Chunk
 * @property {string} heading_path
 * @property {number} chunk_index
 * @property {string} text
 */

/**
 * Chunk a parsed document.
 * @param {{ meta?: Object, body?: string }} doc
 * @returns {Chunk[]}
 */
function chunk(doc) {
  doc = doc || {};
  const meta = doc.meta || {};
  const body = String(doc.body == null ? '' : doc.body);
  const isGuide = (meta.type || 'guide') === 'guide';

  const out = [];
  let index = 0;
  const push = (heading_path, text) => {
    const t = String(text).trim();
    if (t) out.push({ heading_path, chunk_index: index++, text: t });
  };

  // 1. Summary chunk.
  if (meta.summary && String(meta.summary).trim()) {
    push('Summary', String(meta.summary).trim());
  }

  const sections = splitSections(body);

  // 2. Quick Reference chunk (guides only), emitted standalone and whole.
  if (isGuide) {
    for (const sec of sections) {
      if (sec.isQuickRef) push(sec.heading_path, sec.text);
    }
  }

  // 3–5. Pack the remaining sections.
  for (const sec of sections) {
    if (isGuide && sec.isQuickRef) continue; // already emitted standalone
    const blocks = splitAtomicBlocks(sec.text);
    for (const piece of packBlocks(blocks, MAX_CHARS, OVERLAP_CHARS)) {
      push(sec.heading_path, piece);
    }
  }

  return out;
}

/**
 * Split a body into heading-delimited sections, tracking a `heading_path`.
 * Headings inside fenced code blocks are ignored.
 * @param {string} body
 * @returns {Array<{ heading_path: string, text: string, isQuickRef: boolean }>}
 */
function splitSections(body) {
  const lines = body.split(/\r?\n/);
  const sections = [];
  const stack = []; // [{ level, text }]
  let curLines = [];
  let curPath = '';
  let curIsQuickRef = false;
  let inCode = false;
  let fenceMarker = null;

  const flush = () => {
    if (curLines.join('\n').trim()) {
      sections.push({
        heading_path: curPath,
        text: curLines.join('\n'),
        isQuickRef: curIsQuickRef,
      });
    }
    curLines = [];
  };

  for (const line of lines) {
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      if (!inCode) {
        inCode = true;
        fenceMarker = fence[1];
      } else if (new RegExp('^\\s*' + fenceMarker).test(line)) {
        inCode = false;
        fenceMarker = null;
      }
      curLines.push(line);
      continue;
    }

    const h = !inCode && line.match(/^(#{1,6})[ \t]+(.+?)\s*$/);
    if (h) {
      flush();
      const level = h[1].length;
      const heading = h[2].trim();
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      stack.push({ level, text: heading });
      curPath = stack.map((s) => s.text).join(' > ');
      curIsQuickRef = level === 2 && heading.toLowerCase() === 'quick reference';
      curLines = [line];
    } else {
      curLines.push(line);
    }
  }
  flush();

  return sections;
}

/**
 * Split section text into atomic blocks. A fenced code block is one indivisible
 * block; runs of non-blank lines between blank lines are paragraph blocks.
 * @param {string} text
 * @returns {Array<{ code: boolean, text: string }>}
 */
function splitAtomicBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let para = [];

  const flushPara = () => {
    const t = para.join('\n').trim();
    if (t) blocks.push({ code: false, text: t });
    para = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      flushPara();
      const marker = fence[1];
      const code = [line];
      i++;
      while (i < lines.length) {
        code.push(lines[i]);
        const closed = new RegExp('^\\s*' + marker).test(lines[i]);
        i++;
        if (closed) break;
      }
      blocks.push({ code: true, text: code.join('\n') });
      continue;
    }
    if (line.trim() === '') {
      flushPara();
      i++;
      continue;
    }
    para.push(line);
    i++;
  }
  flushPara();

  return blocks;
}

/**
 * Pack atomic blocks into ~maxChars chunks with ~overlap carryover.
 * Code blocks are never split; an over-long code block becomes its own chunk.
 * Overlap is never carried from inside a code block (avoids duplicating code).
 * @param {Array<{ code: boolean, text: string }>} blocks
 * @param {number} maxChars
 * @param {number} overlap
 * @returns {string[]}
 */
function packBlocks(blocks, maxChars, overlap) {
  const out = [];
  let cur = '';
  let lastWasCode = false;

  for (const b of blocks) {
    const bt = b.text;

    // Over-long code block: flush current, emit the block by itself.
    if (b.code && bt.length > maxChars) {
      if (cur.trim()) out.push(cur.trim());
      out.push(bt);
      cur = '';
      lastWasCode = false;
      continue;
    }

    const projected = cur ? cur.length + 2 + bt.length : bt.length;
    if (cur && projected > maxChars) {
      out.push(cur.trim());
      const tail = lastWasCode ? '' : cur.slice(Math.max(0, cur.length - overlap));
      cur = tail ? tail + '\n\n' + bt : bt;
    } else {
      cur = cur ? cur + '\n\n' + bt : bt;
    }
    lastWasCode = b.code;
  }

  if (cur.trim()) out.push(cur.trim());
  return out;
}

module.exports = { chunk };
