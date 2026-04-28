// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock the Tauri APIs so we can drive the unsubscribe-during-listen
// race deterministically. The test harness installs a deferred listen
// implementation; each test resolves it at a specific moment.

let deferredListenResolve: ((unlisten: () => void) => void) | null = null;
let deferredListenReject: ((err: unknown) => void) | null = null;
let lastChannel: string | null = null;
let lastHandler: ((e: { payload: unknown }) => void) | null = null;

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(<T>(channel: string, handler: (e: { payload: T }) => void) => {
    lastChannel = channel;
    lastHandler = handler as (e: { payload: unknown }) => void;
    return new Promise<() => void>((resolve, reject) => {
      deferredListenResolve = resolve;
      deferredListenReject = reject;
    });
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import {
  __resetWarnedForTest,
  makeTauriAskWikiTransport,
  makeTauriRunSnapshotTransport,
} from './tauriTransports.js';

afterEach(() => {
  cleanup();
  deferredListenResolve = null;
  deferredListenReject = null;
  lastChannel = null;
  lastHandler = null;
  __resetWarnedForTest();
  vi.clearAllMocks();
});

describe('makeTauriRunSnapshotTransport', () => {
  it('subscribes to run.snapshot.<runId> and forwards payloads', async () => {
    const transport = makeTauriRunSnapshotTransport();
    const seen: Array<unknown> = [];
    const unsub = transport.subscribe('r-1', (s) => seen.push(s));
    expect(lastChannel).toBe('run.snapshot.r-1');
    // resolve listen() — handler is now installed
    deferredListenResolve!(() => {});
    await new Promise((r) => setTimeout(r, 0));
    lastHandler!({ payload: { runId: 'r-1', state: 'EXECUTING' } });
    expect(seen).toHaveLength(1);
    unsub();
  });

  it('invokes the late-resolving unlisten when consumer disposes early', async () => {
    const transport = makeTauriRunSnapshotTransport();
    const unsub = transport.subscribe('r-1', () => {});
    const unlisten = vi.fn();
    // dispose BEFORE listen() resolves
    unsub();
    deferredListenResolve!(unlisten);
    await new Promise((r) => setTimeout(r, 0));
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('drops snapshots that arrive after dispose', async () => {
    const transport = makeTauriRunSnapshotTransport();
    const seen: Array<unknown> = [];
    const unsub = transport.subscribe('r-1', (s) => seen.push(s));
    deferredListenResolve!(() => {});
    await new Promise((r) => setTimeout(r, 0));
    unsub();
    lastHandler!({ payload: { runId: 'r-1' } });
    expect(seen).toHaveLength(0);
  });

  it('does not throw when listen() rejects (polling is primary)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = makeTauriRunSnapshotTransport();
    const unsub = transport.subscribe('r-1', () => {});
    // W.12.6 — listen() is optional fallback insurance; rejection is
    // swallowed silently because the polling loop is the source of truth.
    deferredListenReject!(new Error('IPC bind failed'));
    await new Promise((r) => setTimeout(r, 0));
    // No error log expected — listen() failure is benign in v0.1.
    const sawListenError = errSpy.mock.calls.some(
      ([msg]) => typeof msg === 'string' && msg.includes('listen'),
    );
    expect(sawListenError).toBe(false);
    unsub();
    errSpy.mockRestore();
  });
});

describe('deferred transport warnings (v0.1.x not-yet-wired)', () => {
  it('wiki transport warns exactly once per process for the deferred ask flow', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t1 = makeTauriAskWikiTransport();
    const t2 = makeTauriAskWikiTransport();
    const ac = new AbortController();
    await t1.ask('q1', ac.signal);
    await t2.ask('q2', ac.signal);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
