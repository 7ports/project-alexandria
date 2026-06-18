import { describe, it, expect } from 'vitest';
import { require } from './helpers.js';

const { parseFrontmatter } = require('../lib/frontmatter.js');

describe('parseFrontmatter', () => {
  it('parses a leading YAML frontmatter block into meta + body', () => {
    const md = [
      '---',
      'id: my-doc',
      'type: concept',
      'title: My Title',
      'summary: A short summary.',
      'tags: [alpha, beta]',
      'embedding_version: 1',
      '---',
      '',
      '# Heading',
      '',
      'Body text.',
    ].join('\n');

    const { meta, body } = parseFrontmatter(md, 'my-doc.md');

    expect(meta.id).toBe('my-doc');
    expect(meta.type).toBe('concept');
    expect(meta.title).toBe('My Title');
    expect(meta.summary).toBe('A short summary.');
    expect(meta.tags).toEqual(['alpha', 'beta']);
    expect(meta.embedding_version).toBe(1);
    // The frontmatter block (and the single blank line after it) is stripped.
    expect(body.startsWith('# Heading')).toBe(true);
    expect(body).toContain('Body text.');
    expect(body).not.toContain('id: my-doc');
  });

  it('treats a file with no frontmatter as a guide, deriving id + title', () => {
    const md = '# Install Foo\n\nStep one.\n';
    const { meta, body } = parseFrontmatter(md, 'install-foo.md');

    // Backward-compatible defaults for un-migrated guides.
    expect(meta.type).toBe('guide');
    expect(meta.id).toBe('install-foo'); // derived from filename
    expect(meta.title).toBe('Install Foo'); // derived from the first H1
    expect(body).toBe(md); // body is the whole document untouched
  });

  it('falls back to id when there is no H1 and no title key', () => {
    const { meta } = parseFrontmatter('Just a paragraph, no heading.', 'loose.md');
    expect(meta.id).toBe('loose');
    expect(meta.title).toBe('loose');
  });
});
