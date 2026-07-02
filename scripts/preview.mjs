#!/usr/bin/env node
// Dependency-free static file server for local preview of the Alexandria docs site.
// Serves docs/ as the web root so /guides/, /guides/manifest.json, /data/embedding-map.json,
// etc. resolve exactly as they do on GitHub Pages. No external deps, no npx download.
// Usage: node scripts/preview.mjs      (PORT env overrides the default 8000)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve docs/ relative to this script (repo root/../docs) regardless of CWD.
const ROOT = path.resolve(__dirname, '..', 'docs');
const PORT = Number(process.env.PORT) || 8000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.bin': 'application/octet-stream',
};

function contentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  // Ignore the query string; decode percent-encoding.
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch {
    return send(res, 400, 'Bad Request', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  // Resolve against ROOT and guard against path traversal.
  let filePath = path.join(ROOT, urlPath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  fs.stat(filePath, (err, stats) => {
    // Directory (or trailing-slash) request -> serve that directory's index.html.
    if (!err && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    } else if (err && urlPath.endsWith('/')) {
      filePath = path.join(filePath, 'index.html');
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        return send(res, 404, `404 Not Found: ${urlPath}`, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      send(res, 200, data, { 'Content-Type': contentType(filePath) });
    });
  });
});

server.listen(PORT, () => {
  console.log(`Alexandria preview serving ${ROOT}`);
  console.log(`  http://localhost:${PORT}/`);
});
