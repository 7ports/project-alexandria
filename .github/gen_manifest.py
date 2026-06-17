"""Generate docs/guides/manifest.json from the guides/ directory."""
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


guides_dir = 'guides'
out_path = 'docs/guides/manifest.json'

entries = []
for fname in sorted(os.listdir(guides_dir)):
    if not fname.endswith('.md'):
        continue
    name = fname[:-3]
    with open(os.path.join(guides_dir, fname), encoding='utf-8') as f:
        content = f.read()
    fm, body = split_frontmatter(content)
    # Extract title from first # heading (body), falling back to frontmatter.
    m = re.search(r'^# (.+)', body, re.MULTILINE)
    title = m.group(1).strip() if m else (fm.get('title') or name)
    # Extract description: first plain-text line after ## Overview,
    # falling back to the frontmatter summary.
    m2 = re.search(r'^## Overview\s*\n+((?:[A-Za-z\[]).+)', body, re.MULTILINE)
    desc = m2.group(1).strip()[:150] if m2 else (fm.get('summary', '') or '')[:150]
    entries.append({'name': name, 'title': title, 'description': desc})

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(entries, f, indent=2, ensure_ascii=False)

print(f'Generated {out_path} with {len(entries)} guides')

# Update the ## Guides section in README.md
readme_path = 'README.md'
sorted_entries = sorted(entries, key=lambda e: e['title'].lower())
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
