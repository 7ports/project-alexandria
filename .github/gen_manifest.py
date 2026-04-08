"""Generate docs/guides/manifest.json from the guides/ directory."""
import json, re, os

guides_dir = 'guides'
out_path = 'docs/guides/manifest.json'

entries = []
for fname in sorted(os.listdir(guides_dir)):
    if not fname.endswith('.md'):
        continue
    name = fname[:-3]
    with open(os.path.join(guides_dir, fname), encoding='utf-8') as f:
        content = f.read()
    # Extract title from first # heading
    m = re.search(r'^# (.+)', content, re.MULTILINE)
    title = m.group(1).strip() if m else name
    # Extract description: first plain-text line after ## Overview
    m2 = re.search(r'^## Overview\s*\n+((?:[A-Za-z\[]).+)', content, re.MULTILINE)
    desc = m2.group(1).strip()[:150] if m2 else ''
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
