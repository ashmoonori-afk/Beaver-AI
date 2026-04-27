// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

import { usePlanList, type PlanListTransport } from './usePlanList.js';
import type { PlanSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

function plan(version: number): PlanSummary {
  return {
    id: `p-${version}`,
    runId: 'r-1',
    version,
    createdAt: new Date('2026-04-28T00:00:00.000Z').toISOString(),
    tasks: [{ id: 't1', agentRole: 'planner', title: `task v${version}` }],
  };
}

describe('usePlanList', () => {
  it('returns empty and never subscribes when runId is null', () => {
    const subscribe = vi.fn();
    const transport: PlanListTransport = { subscribe };
    const { result } = renderHook(() => usePlanList(null, transport));
    expect(result.current).toEqual([]);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('surfaces the latest list pushed by the transport', () => {
    let push!: (list: readonly PlanSummary[]) => void;
    const transport: PlanListTransport = {
      subscribe(_runId, onList) {
        push = onList;
        return () => {};
      },
    };
    const { result } = renderHook(() => usePlanList('r-1', transport));
    act(() => push([plan(2), plan(1)]));
    expect(result.current.map((p) => p.version)).toEqual([2, 1]);
  });

  it('calls cleanup on unmount', () => {
    const unsub = vi.fn();
    const transport: PlanListTransport = { subscribe: () => unsub };
    const { unmount } = renderHook(() => usePlanList('r-1', transport));
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
