import { describe, it, expect, beforeEach } from 'vitest';
import { require } from './helpers.js';

const { maybeRefresh, setLastSyncOk, getLastSyncOk } = require('../lib/refresh.js');

describe('maybeRefresh — TTL gating', () => {
  beforeEach(() => {
    setLastSyncOk(0);
  });

  it('returns "fresh" and does NOT trigger when within the TTL', () => {
    const now = 1_000_000;
    setLastSyncOk(now); // last sync == now → age 0
    let triggered = false;
    const res = maybeRefresh({ ttlMs: 5000, now, trigger: () => { triggered = true; } });
    expect(res).toBe('fresh');
    expect(triggered).toBe(false);
  });

  it('triggers a background refresh when stale', () => {
    const now = 1_000_000;
    setLastSyncOk(now - 10_000); // age 10s > ttl 5s → stale
    let triggered = false;
    const res = maybeRefresh({
      ttlMs: 5000,
      now,
      trigger: () => {
        triggered = true;
        return Promise.resolve();
      },
    });
    expect(res).toBe('triggered');
    expect(triggered).toBe(true);
  });

  it('returns "in-flight" rather than stacking a second refresh', async () => {
    const now = 1_000_000;
    setLastSyncOk(0); // very stale

    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const trigger = () => {
      calls += 1;
      return pending; // stays in-flight until we release it
    };

    const first = maybeRefresh({ ttlMs: 1000, now, trigger });
    const second = maybeRefresh({ ttlMs: 1000, now, trigger });

    expect(first).toBe('triggered');
    expect(second).toBe('in-flight');
    expect(calls).toBe(1); // the second read did not stack another trigger

    // Let the in-flight refresh settle so the guard clears (avoids leaking state).
    release();
    await pending;
    await Promise.resolve();
  });

  it('exposes the last-sync timestamp it was set to', () => {
    setLastSyncOk(42);
    expect(getLastSyncOk()).toBe(42);
  });
});
