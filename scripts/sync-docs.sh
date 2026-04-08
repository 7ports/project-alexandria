#!/bin/bash
# sync-docs.sh — Regenerates docs/guides/manifest.json and the README.md Guides table
# Usage: ./scripts/sync-docs.sh (must be run from the repo root)

set -euo pipefail

# Guard: must be run from repo root
if [ ! -d "guides" ]; then
  echo "Error: 'guides/' directory not found. Run this script from the repo root." >&2
  exit 1
fi

echo "Project Alexandria — Syncing docs..."

python3 .github/gen_manifest.py

echo "Done. Review changes with: git diff README.md docs/guides/manifest.json"
