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
