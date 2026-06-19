#!/usr/bin/env node
// scripts/backfill-tags.mjs
// One-shot, idempotent front-matter tag backfiller for Project Alexandria guides.
// Applies the approved 11-tag single-primary taxonomy: exactly ONE tag per guide.
// Source of truth: the GUIDE_TAGS map below (mirrors docs/project-plan.md
// "## Tag Taxonomy (build prerequisite)"). It rewrites ONLY the front-matter
// `tags:` line to inline flow style, e.g. `tags: [mcp-server]`, preserving all
// other front-matter keys and the entire guide body. Safe to re-run.
//
// The guide slug == the markdown filename without `.md` (matches the
// docs/guides/manifest.json `name` field).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = join(__dirname, '..', 'guides');

/** Single source of truth: guide slug -> single primary tag id (11-tag taxonomy). */
const GUIDE_TAGS = {
  // mcp-server (9)
  'alexandria-mcp-server': 'mcp-server',
  'claude-preview-mcp-server': 'mcp-server',
  'coplay-mcp-server': 'mcp-server',
  'fetch-mcp-server': 'mcp-server',
  'firebase-mcp-server': 'mcp-server',
  'git-mcp-server': 'mcp-server',
  'github-mcp-server': 'mcp-server',
  'memory-mcp-server': 'mcp-server',
  'trello-mcp-server': 'mcp-server',
  // claude-agents (4)
  'claude-code-github-actions': 'claude-agents',
  'claude-in-chrome': 'claude-agents',
  'project-voltron': 'claude-agents',
  'project-voltron-docker': 'claude-agents',
  // frontend-web (6)
  'maplibre-react-map-gl': 'frontend-web',
  'maplibre-vessel-animation': 'frontend-web',
  'vite-dev-proxy': 'frontend-web',
  'vite-plugin-pwa': 'frontend-web',
  'sse-server-sent-events': 'frontend-web',
  'express-5-node-typescript': 'frontend-web',
  // cloud-iac (3)
  'aws-cli': 'cloud-iac',
  'terraform-aws-ec2': 'cloud-iac',
  'terraform-aws-frontend-hosting': 'cloud-iac',
  // deployment-ci (3)
  'flyio-deployment': 'deployment-ci',
  'github-actions-ec2-deploy': 'deployment-ci',
  'github-pages-jekyll-actions': 'deployment-ci',
  // data-apis (3)
  'aisstream-io': 'data-apis',
  'environment-canada-weather-api': 'data-apis',
  'toronto-city-open-data-ferry': 'data-apis',
  // ai-ml (4)
  'embeddings-local-vs-hosted': 'ai-ml',
  'vector-db-options': 'ai-ml',
  'client-side-embedding-visualizer': 'ai-ml',
  'transformers-js-browser-embeddings': 'ai-ml',
  // observability (2)
  'loki-grafana-stack': 'observability',
  'prometheus-grafana-docker-compose': 'observability',
  // testing (2)
  'supertest': 'testing',
  'vitest': 'testing',
  // languages-build (3)
  'go-stringer': 'languages-build',
  'r-windows-setup': 'languages-build',
  'unity-asmdef-assembly-csharp-reference': 'languages-build',
  // dev-tooling (4)
  'beads': 'dev-tooling',
  'github-cli': 'dev-tooling',
  'npm-publish-2fa-tokens': 'dev-tooling',
  'rancher-desktop-windows': 'dev-tooling',
};

/**
 * Rewrite the `tags:` line inside the FIRST front-matter block only.
 * Idempotent: re-running yields the same `tags: [tag]` line.
 */
function rewriteTagsLine(content, tag, slug) {
  if (!/^﻿?---[ \t]*\r?\n/.test(content)) {
    throw new Error(`${slug}: no leading YAML front-matter`);
  }
  const lines = content.split('\n');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '---' || t === '...') { end = i; break; }
  }
  if (end === -1) throw new Error(`${slug}: unterminated front-matter`);
  let found = false;
  for (let i = 1; i < end; i++) {
    if (/^tags:/.test(lines[i])) {
      // Preserve a trailing \r if the file uses CRLF line endings.
      const cr = lines[i].endsWith('\r') ? '\r' : '';
      lines[i] = `tags: [${tag}]${cr}`;
      found = true;
      break;
    }
  }
  if (!found) throw new Error(`${slug}: no \`tags:\` line in front-matter`);
  return lines.join('\n');
}

function main() {
  const slugs = Object.keys(GUIDE_TAGS);
  let changed = 0;
  let unchanged = 0;
  const missing = [];
  for (const slug of slugs) {
    const file = join(GUIDES_DIR, `${slug}.md`);
    if (!existsSync(file)) { missing.push(slug); continue; }
    const original = readFileSync(file, 'utf8');
    const updated = rewriteTagsLine(original, GUIDE_TAGS[slug], slug);
    if (updated !== original) {
      writeFileSync(file, updated);
      changed++;
    } else {
      unchanged++;
    }
  }
  console.log(`backfill-tags: ${slugs.length} mapped, ${changed} changed, ${unchanged} already current.`);
  if (missing.length) {
    console.error(`WARNING: ${missing.length} mapped slug(s) missing on disk: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
}

main();
