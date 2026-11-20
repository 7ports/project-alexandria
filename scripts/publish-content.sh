#!/bin/bash
# publish-content.sh — mirror every knowledge doc into docs/ for GitHub Pages.
#
#   guides/*.md     -> docs/guides/*.md      (next to the browse page + manifest)
#   concepts/*.md   -> docs/concepts/*.md
#   articles/*.md   -> docs/articles/*.md
#   references/*.md -> docs/references/*.md
#
# Each content dir's README.md describes the directory and is not published. Published .md
# files whose source was deleted are removed, so the site never serves a doc that no longer
# exists. Only *.md files are touched: docs/guides/index.html and manifest.json stay.
#
# Usage: bash scripts/publish-content.sh   (from the repo root)

set -euo pipefail

if [ ! -d "guides" ]; then
  echo "Error: run this from the repo root (guides/ not found)." >&2
  exit 1
fi

for dir in guides concepts articles references; do
  [ -d "$dir" ] || continue
  mkdir -p "docs/$dir"

  # Drop published copies whose source is gone (or is a README).
  for published in "docs/$dir"/*.md; do
    [ -e "$published" ] || continue
    name=$(basename "$published")
    if [ "$name" = "README.md" ] || [ ! -f "$dir/$name" ]; then
      rm -f "$published"
    fi
  done

  count=0
  for src in "$dir"/*.md; do
    [ -e "$src" ] || continue
    [ "$(basename "$src")" = "README.md" ] && continue
    cp "$src" "docs/$dir/"
    count=$((count + 1))
  done
  echo "  published $count doc(s) to docs/$dir/"
done
