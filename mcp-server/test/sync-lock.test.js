import { describe, it, expect, afterEach } from 'vitest';
import { require, tmpLockPath, rmFile } from './helpers.js';

const { withLock } = require('../lib/sync-lock.js');

const locks = [];
afterEach(() => {
  while (locks.length) rmFile(locks.pop());
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('withLock', () => {
  it('serializes two concurrent critical sections on the same lockfile', async () => {
    const lockPath = tmpLockPath();
    locks.push(lockPath);

    const events = [];
    let active = 0;
    let maxActive = 0;

    const critical = (id) =>
      withLock(lockPath, async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        events.push(`enter-${id}`);
        await sleep(40); // hold the lock long enough to overlap if unserialized
        events.push(`exit-${id}`);
        active -= 1;
        return id;
      });

    const [a, b] = await Promise.all([critical('A'), critical('B')]);

    expect(a).toBe('A');
    expect(b).toBe('B');
    // Never two holders at once.
    expect(maxActive).toBe(1);
    // Each section fully completes before the next enters: no interleaving like
    // enter-A, enter-B, exit-A, exit-B.
    const first = events[0].split('-')[1];
    expect(events).toEqual([`enter-${first}`, `exit-${first}`,
      `enter-${first === 'A' ? 'B' : 'A'}`, `exit-${first === 'A' ? 'B' : 'A'}`]);
  });

  it('runs and releases so a later acquisition succeeds', async () => {
    const lockPath = tmpLockPath();
    locks.push(lockPath);

    const r1 = await withLock(lockPath, async () => 'one');
    const r2 = await withLock(lockPath, async () => 'two');
    expect(r1).toBe('one');
    expect(r2).toBe('two');
  });
});
