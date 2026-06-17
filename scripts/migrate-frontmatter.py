#!/usr/bin/env python3
"""migrate-frontmatter.py — add YAML frontmatter to legacy guides.

For every guides/*.md WITHOUT a leading `---` frontmatter block, prepend a
frontmatter block carrying the content-schema fields. The existing markdown
body (including its `# H1`) is preserved verbatim below the block — the H1 is
NOT duplicated. Idempotent: files that already start with `---` are skipped.

Run from the repo root:  python3 scripts/migrate-frontmatter.py
"""
import json
import os
import re
import sys

GUIDES_DIR = "guides"
TODAY = "2026-06-17"
EMBEDDING_VERSION = 1


def first_h1(body: str) -> str:
    m = re.search(r"^#[ \t]+(.+?)\s*$", body, re.MULTILINE)
    return m.group(1).strip() if m else ""


def overview_summary(body: str) -> str:
    """First sentence of the first plain-text line after `## Overview`."""
    m = re.search(r"^## Overview\s*\n+((?:[A-Za-z\[]).+)", body, re.MULTILINE)
    if not m:
        return ""
    line = m.group(1).strip()
    # First sentence: up to the first ./!/? that ends a sentence.
    s = re.match(r"^(.+?[.!?])(?:\s|$)", line)
    return (s.group(1) if s else line).strip()


def build_frontmatter(slug: str, title: str, summary: str) -> str:
    lines = ["---"]
    lines.append(f"id: {slug}")
    lines.append("type: guide")
    # JSON-encode the title → valid quoted scalar that the naive parser's
    # stripQuotes handles; keeps colons / em-dashes safe.
    lines.append(f"title: {json.dumps(title, ensure_ascii=False)}")
    if summary:
        # Folded block scalar — avoids any quoting/colon escaping concerns.
        lines.append("summary: >")
        lines.append(f"  {summary}")
    else:
        lines.append('summary: ""')
    lines.append("tags: []")
    lines.append("status: active")
    lines.append(f"created: {TODAY}")
    lines.append(f"updated: {TODAY}")
    lines.append(f"embedding_version: {EMBEDDING_VERSION}")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def main() -> int:
    if not os.path.isdir(GUIDES_DIR):
        print("Error: run from repo root (guides/ not found)", file=sys.stderr)
        return 1

    migrated, skipped = [], []
    for fname in sorted(os.listdir(GUIDES_DIR)):
        if not fname.endswith(".md"):
            continue
        path = os.path.join(GUIDES_DIR, fname)
        with open(path, encoding="utf-8") as f:
            content = f.read()

        # Skip files that already carry frontmatter (tolerate a BOM).
        if content.lstrip("﻿").startswith("---"):
            skipped.append(fname)
            continue

        slug = fname[:-3]
        title = first_h1(content) or slug
        summary = overview_summary(content)
        block = build_frontmatter(slug, title, summary)

        with open(path, "w", encoding="utf-8") as f:
            f.write(block + content)
        migrated.append(fname)

    print(f"Migrated {len(migrated)} guide(s); skipped {len(skipped)} (already had frontmatter).")
    for fname in migrated:
        print(f"  + {fname}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
