// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

import { useRunSnapshot, type RunSnapshotTransport } from './useRunSnapshot.js';
import type { RunSnapshot } from '../types.js';

afterEach(() => {
  cleanup();
});

function makeSnapshot(runId: string, overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId,
    state: 'PLANNING',
    startedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
    spentUsd: 0,
    budgetUsd: 20,
    agents: [],
    openCheckpoints: 0,
    ...overrides,
  };
}

describe('useRunSnapshot', () => {
  it('returns null while runId is null and never subscribes', () => {
    const subscribe = vi.fn();
    const transport: RunSnapshotTransport = { subscribe };
    const { result } = renderHook(() => useRunSnapshot(null, transport));
    expect(result.current).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('subscribes when a runId is supplied and surfaces the latest snapshot', () => {
    let pushed: ((s: RunSnapshot) => void) | null = null;
    const transport: RunSnapshotTransport = {
      subscribe(_runId, onSnapshot) {
        pushed = onSnapshot;
        return () => {};
      },
    };
    const { result } = renderHook(() => useRunSnapshot('r-1', transport));
    act(() => {
      pushed!(makeSnapshot('r-1', { state: 'EXECUTING' }));
    });
    expect(result.current?.state).toBe('EXECUTING');
  });

  it('calls the cleanup fn returned from subscribe on unmount', () => {
    const unsub = vi.fn();
    const transport: RunSnapshotTransport = {
      subscribe() {
        return unsub;
      },
    };
    const { unmount } = renderHook(() => useRunSnapshot('r-1', transport));
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('re-subscribes when runId changes', () => {
    const subscribe = vi.fn(() => () => {});
    const transport: RunSnapshotTransport = { subscribe };
    const { rerender } = renderHook(
      ({ runId }: { runId: string | null }) => useRunSnapshot(runId, transport),
      { initialProps: { runId: 'r-1' as string | null } },
    );
    expect(subscribe).toHaveBeenCalledTimes(1);
    rerender({ runId: 'r-2' });
    expect(subscribe).toHaveBeenCalledTimes(2);
  });
});
