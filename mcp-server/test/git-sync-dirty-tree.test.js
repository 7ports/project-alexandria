import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { require } from './helpers.js';

const { syncCommitAndPush } = require('../lib/git-sync.js');

// Real-git integration test (not the fake-git-on-PATH shim): the bug is that
// `git rebase` refuses to run against a dirty working tree, so we need a genuine
// repo + genuine remote to prove the push actually lands despite unrelated dirty
// files. Reproduces the live failure: the repo tree is permanently dirty (a
// session hook rewrites unrelated tracked files every session), which blocked
// every auto-push until the rebase learned to --autostash.

const cleanups = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function makeRepoWithRemote() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'alexandria-dirty-'));
  cleanups.push(() => fs.rmSync(root, { recursive: true, force: true }));

  const originDir = path.join(root, 'origin.git');
  const workDir = path.join(root, 'work');

  // Bare remote to push into.
  git(['init', '--bare', '-b', 'work-branch', originDir], root);

  // Working clone with a resolvable identity + branch.
  git(['init', '-b', 'work-branch', workDir], root);
  git(['config', 'user.email', 'test@alexandria'], workDir);
  git(['config', 'user.name', 'Alexandria Test'], workDir);
  git(['remote', 'add', 'origin', originDir], workDir);

  // Seed a tracked "unrelated" file + an initial commit, then publish the branch
  // so origin/work-branch exists for the rebase target.
  const unrelated = path.join(workDir, 'unrelated.txt');
  fs.writeFileSync(unrelated, 'original content\n');
  fs.writeFileSync(path.join(workDir, 'seed.txt'), 'seed\n');
  git(['add', '.'], workDir);
  git(['commit', '-m', 'seed'], workDir);
  git(['push', '-u', 'origin', 'work-branch'], workDir);

  return { root, workDir, unrelated };
}

describe('syncCommitAndPush — dirty working tree (unrelated files)', () => {
  it('pushes despite a tracked-but-modified unrelated file, leaving it untouched', async () => {
    const { workDir, unrelated } = makeRepoWithRemote();

    // Dirty the tree with a modification UNRELATED to the file we will sync —
    // exactly the permanently-dirty condition that blocked every push.
    const dirtyContents = 'locally modified — must survive byte-identical\n';
    fs.writeFileSync(unrelated, dirtyContents);
    const before = fs.readFileSync(unrelated, 'utf-8');
    const statusBefore = git(['status', '--short'], workDir);
    expect(statusBefore).toContain('unrelated.txt');

    // Write the file we actually want to sync.
    const target = path.join(workDir, 'guides');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'foo.md'), '# Foo\n');

    const r = await syncCommitAndPush('guides/foo.md', 'docs(guide): create foo', {
      cwd: workDir,
      lockPath: path.join(workDir, '.git', 'alexandria-sync.lock'),
      maxRetries: 2,
    });

    // 1. The push actually succeeded.
    expect(r.committed).toBe(true);
    expect(r.pushed).toBe(true);
    expect(r.branch).toBe('work-branch');

    // The commit really landed on the remote.
    const remoteHead = git(['rev-parse', 'refs/remotes/origin/work-branch'], workDir);
    const localHead = git(['rev-parse', 'HEAD'], workDir);
    expect(remoteHead).toBe(localHead);

    // 2. The unrelated file is byte-identical AND still modified (never
    //    discarded, committed, or reverted).
    expect(fs.readFileSync(unrelated, 'utf-8')).toBe(before);
    expect(fs.readFileSync(unrelated, 'utf-8')).toBe(dirtyContents);
    const statusAfter = git(['status', '--short'], workDir);
    expect(statusAfter).toContain('unrelated.txt');
    // The unrelated file must NOT have been swept into our commit.
    const committedFiles = git(['show', '--name-only', '--pretty=format:', 'HEAD'], workDir);
    expect(committedFiles).toContain('guides/foo.md');
    expect(committedFiles).not.toContain('unrelated.txt');

    // 3. No dangling stash entry and no half-finished rebase state.
    expect(git(['stash', 'list'], workDir)).toBe('');
    expect(fs.existsSync(path.join(workDir, '.git', 'rebase-merge'))).toBe(false);
    expect(fs.existsSync(path.join(workDir, '.git', 'rebase-apply'))).toBe(false);
  });
});
