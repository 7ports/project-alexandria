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
echo "Regenerating embedding map (3D visualizer data)..."
echo "Reindexing knowledge base (embeddings)..."
node -e "const idx=require('./mcp-server/lib/index-store'); const {reindexAll}=require('./mcp-server/lib/reindex'); (async()=>{const s=idx.openIndex(); const r=await reindexAll(s,{force:true}); console.log('reindexed '+JSON.stringify(r)); idx.close(s);})().catch(e=>{console.error(e);process.exit(1);});"
node scripts/build-embedding-map.mjs

echo "Done. Review changes with: git diff README.md docs/guides/manifest.json"
