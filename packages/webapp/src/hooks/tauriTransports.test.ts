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
  makeTauriCheckpointTransport,
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

  it('logs but does not throw when listen() rejects', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const transport = makeTauriRunSnapshotTransport();
    const unsub = transport.subscribe('r-1', () => {});
    deferredListenReject!(new Error('IPC bind failed'));
    await new Promise((r) => setTimeout(r, 0));
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringMatching(/listen.*run.snapshot.r-1.*failed/),
      expect.any(Error),
    );
    unsub();
    errSpy.mockRestore();
  });
});

describe('stub transport warnings (4D.2.x not-yet-wired)', () => {
  it('warnOnce fires exactly one console.warn per stub name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t1 = makeTauriCheckpointTransport();
    const t2 = makeTauriCheckpointTransport();
    const u1 = t1.subscribe('r-1', () => {});
    const u2 = t2.subscribe('r-2', () => {});
    expect(warn).toHaveBeenCalledTimes(1);
    u1();
    u2();
    warn.mockRestore();
  });
});
