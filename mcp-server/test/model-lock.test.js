import { describe, it, expect } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { require } from './helpers.js';

const { embedPassage } = require('../lib/embedder.js');

const SERVER_DIR = path.resolve(__dirname, '..');
const MODEL_DIR = path.join(SERVER_DIR, '.models', 'Xenova', 'bge-small-en-v1.5');
const MODEL_FILE = path.join(MODEL_DIR, 'onnx', 'model.onnx');

/**
 * Hold `file` open for writing while sharing it only with readers, as a just-closed download
 * or an antivirus scan does. onnxruntime's own open denies sharing with writers, so a load
 * that hands it the model's path fails with "system error number 13" for as long as this
 * handle exists. Node cannot choose a share mode, so PowerShell holds the handle.
 */
async function holdWriteLock(file) {
  const script = [
    `$fs = [System.IO.File]::Open('${file.replace(/'/g, "''")}', 'Open', 'ReadWrite', 'Read')`,
    "[Console]::Out.WriteLine('locked')",
    '[void][Console]::In.ReadLine()',
    '$fs.Close()',
  ].join('; ');
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`lock holder exited early (code ${code})`)));
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('locked')) resolve();
    });
  });
  return {
    release: () =>
      new Promise((resolve) => {
        child.removeAllListeners('exit');
        child.on('exit', resolve);
        child.stdin.end('\n');
      }),
  };
}

// A fresh process, so the model is loaded from disk rather than this process's pipeline.
async function embedInChild() {
  const script = `
    require('./lib/embedder').embedPassage('Project Alexandria stores tooling guides.')
      .then((v) => process.stdout.write(String(v.length)))
      .catch((err) => { process.stderr.write(String(err && err.message)); process.exit(1); });
  `;
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['-e', script], {
      cwd: SERVER_DIR,
      encoding: 'utf8',
    });
    return Number(stdout);
  } catch (err) {
    throw new Error(`embed failed under the lock: ${err.stderr || err.message}`);
  }
}

describe.skipIf(process.platform !== 'win32')('model load on Windows', () => {
  it('caches every downloaded model file in place, with no temp files left behind', async () => {
    await embedPassage('warm the model cache');
    expect(fs.statSync(MODEL_FILE).size).toBeGreaterThan(100e6);
    const leftovers = fs.readdirSync(MODEL_DIR, { recursive: true }).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });

  it('loads the cached model while another process holds it open for writing', async () => {
    await embedPassage('warm the model cache');
    const lock = await holdWriteLock(MODEL_FILE);
    try {
      expect(await embedInChild()).toBe(384);
    } finally {
      await lock.release();
    }
  });
});
