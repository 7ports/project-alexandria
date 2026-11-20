"""Generate docs/guides/manifest.json from every content dir.

One entry per knowledge doc across guides/, concepts/, articles/ and references/
(README.md in each dir is a directory description, not a doc). Each entry carries
`type`, which the site uses to locate the published copy: guides live next to the
manifest in docs/guides/, the other types in docs/<dir>/. The README.md Guides
table stays guides-only.
"""
import json, re, os


def split_frontmatter(content):
    """Split a leading `--- ... ---` YAML frontmatter block off the content.

    Returns (frontmatter_dict, body). Guides now carry frontmatter; the title
    and description are still extracted from the body (`# H1` / `## Overview`)
    so manifest output is unchanged, with frontmatter `title`/`summary` used as
    a fallback. A file without frontmatter yields ({}, content) unchanged.
    """
    text = content.lstrip('﻿')
    if not re.match(r'^---[ \t]*\r?\n', text):
        return {}, content
    lines = text.split('\n')
    end = -1
    for i in range(1, len(lines)):
        if re.match(r'^(---|\.\.\.)[ \t]*\r?$', lines[i]) or lines[i].rstrip() in ('---', '...'):
            end = i
            break
    if end == -1:
        return {}, content
    fm = {}
    for raw in lines[1:end]:
        m = re.match(r'^([A-Za-z0-9_]+):[ \t]*(.*)$', raw)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in '"\'':
            val = val[1:-1]
        fm[key] = val
    body = '\n'.join(lines[end + 1:]).lstrip('\n')
    return fm, body


CONTENT_DIRS = [('guide', 'guides'), ('concept', 'concepts'),
                ('article', 'articles'), ('reference', 'references')]
out_path = 'docs/guides/manifest.json'

entries = []
for doc_type, content_dir in CONTENT_DIRS:
    if not os.path.isdir(content_dir):
        continue
    for fname in sorted(os.listdir(content_dir)):
        if not fname.endswith('.md') or fname.lower() == 'readme.md':
            continue
        name = fname[:-3]
        with open(os.path.join(content_dir, fname), encoding='utf-8') as f:
            content = f.read()
        fm, body = split_frontmatter(content)
        # Guides: title from the first # heading (body), falling back to frontmatter.
        # Other types are written via write_knowledge, which always sets a frontmatter
        # title, and often have no H1 (a `# comment` in a code block would match).
        m = re.search(r'^# (.+)', body, re.MULTILINE)
        h1 = m.group(1).strip() if m else None
        if doc_type == 'guide':
            title = h1 or fm.get('title') or name
        else:
            title = fm.get('title') or h1 or name
        # Extract description: first plain-text line after ## Overview,
        # falling back to the frontmatter summary.
        m2 = re.search(r'^## Overview\s*\n+((?:[A-Za-z\[]).+)', body, re.MULTILINE)
        desc = m2.group(1).strip()[:150] if m2 else (fm.get('summary', '') or '')[:150]
        entries.append({'name': name, 'type': doc_type, 'title': title, 'description': desc})

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(entries, f, indent=2, ensure_ascii=False)

counts = {}
for e in entries:
    counts[e['type']] = counts.get(e['type'], 0) + 1
print(f'Generated {out_path} with {len(entries)} docs ' + str(counts))

# Update the ## Guides section in README.md
readme_path = 'README.md'
sorted_entries = sorted((e for e in entries if e['type'] == 'guide'), key=lambda e: e['title'].lower())
table_lines = [
    '| Guide | Description |',
    '|-------|-------------|',
]
for e in sorted_entries:
    table_lines.append(f"| [{e['title']}](guides/{e['name']}.md) | {e['description']} |")
table = '\n'.join(table_lines)

with open(readme_path, encoding='utf-8') as f:
    readme = f.read()

updated = re.sub(
    r'(## Guides\n).*?(?=\n## )',
    r'\1\n' + table + '\n',
    readme,
    flags=re.DOTALL,
)

with open(readme_path, 'w', encoding='utf-8') as f:
    f.write(updated)

print(f'Updated README.md with {len(sorted_entries)} guides in the Guides table')
