// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

import { useCheckpoints, type CheckpointTransport } from './useCheckpoints.js';
import type { CheckpointSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

function sample(id: string): CheckpointSummary {
  return {
    id,
    runId: 'r-1',
    kind: 'plan-approval',
    prompt: 'p',
    postedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
  };
}

describe('useCheckpoints', () => {
  it('returns an empty list and never subscribes when runId is null', () => {
    const subscribe = vi.fn();
    const transport: CheckpointTransport = {
      subscribe,
      answer: vi.fn(),
    };
    const { result } = renderHook(() => useCheckpoints(null, transport));
    expect(result.current.checkpoints).toEqual([]);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('surfaces the latest list pushed by the transport', () => {
    let push!: (list: readonly CheckpointSummary[]) => void;
    const transport: CheckpointTransport = {
      subscribe(_runId, onList) {
        push = onList;
        return () => {};
      },
      answer: vi.fn(),
    };
    const { result } = renderHook(() => useCheckpoints('r-1', transport));
    act(() => push([sample('a'), sample('b')]));
    expect(result.current.checkpoints.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('forwards answer() to the transport', async () => {
    const answer = vi.fn().mockResolvedValue(undefined);
    const transport: CheckpointTransport = {
      subscribe: () => () => {},
      answer,
    };
    const { result } = renderHook(() => useCheckpoints('r-1', transport));
    await act(async () => {
      await result.current.answer('cp-1', 'approve');
    });
    expect(answer).toHaveBeenCalledWith('cp-1', 'approve');
  });

  it('calls the cleanup fn on unmount', () => {
    const unsub = vi.fn();
    const transport: CheckpointTransport = {
      subscribe: () => unsub,
      answer: vi.fn(),
    };
    const { unmount } = renderHook(() => useCheckpoints('r-1', transport));
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
