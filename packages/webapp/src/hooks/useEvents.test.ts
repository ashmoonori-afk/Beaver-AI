// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

import { useEvents, type EventsTransport } from './useEvents.js';
import type { LogEvent } from '../types.js';

afterEach(() => {
  cleanup();
});

function ev(id: string, message = `msg-${id}`): LogEvent {
  return {
    id,
    runId: 'r-1',
    ts: new Date('2026-04-28T00:00:00.000Z').toISOString(),
    level: 'info',
    source: 'orchestrator',
    message,
  };
}

describe('useEvents', () => {
  it('returns empty and never subscribes when runId is null', () => {
    const subscribe = vi.fn();
    const transport: EventsTransport = { subscribe };
    const { result } = renderHook(() => useEvents(null, transport));
    expect(result.current).toEqual([]);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('appends events in arrival order', () => {
    let push!: (e: LogEvent) => void;
    const transport: EventsTransport = {
      subscribe(_runId, onEvent) {
        push = onEvent;
        return () => {};
      },
    };
    const { result } = renderHook(() => useEvents('r-1', transport));
    act(() => push(ev('a')));
    act(() => push(ev('b')));
    act(() => push(ev('c')));
    expect(result.current.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('calls the cleanup fn returned from subscribe on unmount', () => {
    const unsub = vi.fn();
    const transport: EventsTransport = { subscribe: () => unsub };
    const { unmount } = renderHook(() => useEvents('r-1', transport));
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('resets the buffer when runId changes', () => {
    const subscribers: Array<(e: LogEvent) => void> = [];
    const transport: EventsTransport = {
      subscribe(_runId, onEvent) {
        subscribers.push(onEvent);
        return () => {};
      },
    };
    const { result, rerender } = renderHook(
      ({ runId }: { runId: string | null }) => useEvents(runId, transport),
      { initialProps: { runId: 'r-1' as string | null } },
    );
    act(() => subscribers[0]!(ev('a')));
    expect(result.current).toHaveLength(1);
    rerender({ runId: 'r-2' });
    expect(result.current).toEqual([]);
  });
});
