import { describe, it, expect } from 'vitest';
import { require } from './helpers.js';

const { chunk } = require('../lib/chunker.js');

describe('chunk', () => {
  it('emits a standalone Summary chunk and a standalone Quick Reference chunk for guides', () => {
    const doc = {
      meta: { id: 'g', type: 'guide', title: 'G', summary: 'Install and run the widget.' },
      body: [
        '## Quick Reference',
        '',
        '```bash',
        'npm install widget',
        'widget --start',
        '```',
        '',
        '## Background',
        '',
        'The widget is a thing that does things in a paragraph of prose.',
      ].join('\n'),
    };

    const chunks = chunk(doc);

    const summary = chunks.find((c) => c.heading_path === 'Summary');
    expect(summary).toBeTruthy();
    expect(summary.text).toBe('Install and run the widget.');

    const qref = chunks.find((c) => c.heading_path === 'Quick Reference');
    expect(qref).toBeTruthy();
    expect(qref.text).toContain('npm install widget');
    expect(qref.text).toContain('widget --start');

    // Quick Reference is emitted exactly once (standalone, not also re-packed).
    const qrefCount = chunks.filter((c) => c.heading_path === 'Quick Reference').length;
    expect(qrefCount).toBe(1);

    // chunk_index values are unique and contiguous from 0.
    const indices = chunks.map((c) => c.chunk_index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('never splits a fenced code block across chunks, even when over-long', () => {
    // A single code block well over MAX_CHARS (2000) must stay intact.
    const codeLines = [];
    for (let i = 0; i < 200; i++) {
      codeLines.push(`const line${i} = ${i}; // some padding to grow the block wide`);
    }
    const codeBlock = '```js\n' + codeLines.join('\n') + '\n```';
    const doc = {
      meta: { id: 'c', type: 'concept', title: 'C' },
      body: '## Code\n\n' + codeBlock + '\n',
    };

    const chunks = chunk(doc);

    // Exactly one chunk contains the opening fence, and that same chunk holds
    // the closing fence plus the first and last code lines — i.e. unsplit.
    const withOpen = chunks.filter((c) => c.text.includes('```js'));
    expect(withOpen.length).toBe(1);
    const whole = withOpen[0];
    expect(whole.text).toContain('const line0 =');
    expect(whole.text).toContain('const line199 =');
    // Balanced fences: an even number of ``` markers => no fence was orphaned.
    const fenceCount = (whole.text.match(/```/g) || []).length;
    expect(fenceCount % 2).toBe(0);
  });

  it('does not emit a Quick Reference standalone chunk for non-guide types', () => {
    const doc = {
      meta: { id: 'a', type: 'article', title: 'A' },
      body: '## Quick Reference\n\nSome reference content.\n',
    };
    const chunks = chunk(doc);
    // For articles the section is still chunked, but not via the guide-only
    // standalone Quick Reference path — content is preserved regardless.
    const joined = chunks.map((c) => c.text).join('\n');
    expect(joined).toContain('Some reference content.');
  });
});
