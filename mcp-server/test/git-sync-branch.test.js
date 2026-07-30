import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { require } from './helpers.js';

const { syncCommitAndPush } = require('../lib/git-sync.js');

// Each test installs a fake `git` on PATH that records every invocation's argv
// and returns scripted output. This "stubs git execution" without touching the
// real repo: we assert the exact argv the sync sends to git, and that failing
// syncs surface a truthful pushed:false + reason to the caller.
const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

function installFakeGit({ branch, fail = '', headSha = 'sha-abc', remoteSha = 'sha-abc' }) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alexandria-gitsync-'));
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alexandria-gitbin-'));
  const logPath = path.join(workDir, 'git-argv.log');
  const lockPath = path.join(workDir, 'sync.lock');

  const shim = `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(args) + '\\n');
const sub = args[0];
if (sub === ${JSON.stringify(fail)}) { process.stderr.write(sub + ' failed (shim)\\n'); process.exit(1); }
if (sub === 'rev-parse' && args[1] === '--abbrev-ref') { process.stdout.write(${JSON.stringify(branch)} + '\\n'); process.exit(0); }
if (sub === 'rev-parse' && args[1] === 'HEAD') { process.stdout.write(${JSON.stringify(headSha)} + '\\n'); process.exit(0); }
if (sub === 'rev-parse') { process.stdout.write(${JSON.stringify(remoteSha)} + '\\n'); process.exit(0); }
process.exit(0);
`;
  fs.writeFileSync(path.join(binDir, 'git'), shim, { mode: 0o755 });

  const oldPath = process.env.PATH;
  process.env.PATH = binDir + path.delimiter + oldPath;
  cleanups.push(() => {
    process.env.PATH = oldPath;
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(binDir, { recursive: true, force: true });
  });

  const readArgv = () =>
    (fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf-8').trim() : '')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));

  return { workDir, lockPath, readArgv };
}

describe('syncCommitAndPush — dynamic branch + truthful result', () => {
  it('pushes the dynamically-resolved branch and never the literal "main"', async () => {
    const { workDir, lockPath, readArgv } = installFakeGit({ branch: 'feature-xyz' });

    const r = await syncCommitAndPush('guides/foo.md', 'docs(guide): create foo', {
      cwd: workDir,
      lockPath,
      maxRetries: 1,
    });

    expect(r.pushed).toBe(true);
    expect(r.committed).toBe(true);
    expect(r.branch).toBe('feature-xyz');
    expect(r.remote).toBe('origin');

    const argv = readArgv();
    const pushCall = argv.find((a) => a[0] === 'push');
    expect(pushCall).toEqual(['push', 'origin', 'feature-xyz']);
    // The old hardcoded-main bug would surface as a push to "main". It must not.
    expect(argv.some((a) => a.includes('main'))).toBe(false);
  });

  it('fails loudly (never defaults to main) when the branch cannot be resolved', async () => {
    // rev-parse --abbrev-ref returns empty → currentBranch throws → no push.
    const { workDir, lockPath, readArgv } = installFakeGit({ branch: '' });

    const r = await syncCommitAndPush('guides/foo.md', 'docs(guide): create foo', {
      cwd: workDir,
      lockPath,
      maxRetries: 1,
    });

    expect(r.pushed).toBe(false);
    expect(r.reason).toBe('branch-unresolved');
    expect(String(r.error || '')).not.toEqual('');

    const argv = readArgv();
    expect(argv.some((a) => a[0] === 'push')).toBe(false);
    expect(argv.some((a) => a.includes('main'))).toBe(false);
  });

  it('returns pushed:false with a non-empty reason when the sync fails (fetch error reaches caller)', async () => {
    const { workDir, lockPath } = installFakeGit({ branch: 'feature-xyz', fail: 'fetch' });

    const r = await syncCommitAndPush('guides/foo.md', 'docs(guide): create foo', {
      cwd: workDir,
      lockPath,
      maxRetries: 1,
    });

    expect(r.pushed).toBe(false);
    expect(r.reason).toBe('fetch-failed');
    expect(typeof r.reason).toBe('string');
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it('wrong-ref guard: reports NOT pushed when the remote ref does not match HEAD', async () => {
    const { workDir, lockPath } = installFakeGit({
      branch: 'feature-xyz',
      headSha: 'sha-local',
      remoteSha: 'sha-other',
    });

    const r = await syncCommitAndPush('guides/foo.md', 'docs(guide): create foo', {
      cwd: workDir,
      lockPath,
      maxRetries: 1,
    });

    expect(r.pushed).toBe(false);
    expect(r.reason).toBe('push-ref-mismatch');
    expect(r.branch).toBe('feature-xyz');
  });
});
