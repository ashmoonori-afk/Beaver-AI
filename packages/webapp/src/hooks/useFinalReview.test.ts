// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';

import { useFinalReview, type FinalReviewTransport } from './useFinalReview.js';
import type { FinalReportSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

function makeReport(): FinalReportSummary {
  return {
    runId: 'r-1',
    generatedAt: new Date('2026-04-28T00:00:00.000Z').toISOString(),
    markdown: '# done',
    branches: [],
  };
}

describe('useFinalReview', () => {
  it('returns null and never subscribes when runId is null', () => {
    const subscribe = vi.fn();
    const transport: FinalReviewTransport = { subscribe, decide: vi.fn() };
    const { result } = renderHook(() => useFinalReview(null, transport));
    expect(result.current.report).toBeNull();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('surfaces the latest report from the transport', () => {
    let push!: (r: FinalReportSummary | null) => void;
    const transport: FinalReviewTransport = {
      subscribe(_runId, onReport) {
        push = onReport;
        return () => {};
      },
      decide: vi.fn(),
    };
    const { result } = renderHook(() => useFinalReview('r-1', transport));
    act(() => push(makeReport()));
    expect(result.current.report?.runId).toBe('r-1');
    act(() => push(null));
    expect(result.current.report).toBeNull();
  });

  it('forwards decide(decision) to the transport with the active runId', async () => {
    const decide = vi.fn().mockResolvedValue(undefined);
    const transport: FinalReviewTransport = {
      subscribe: () => () => {},
      decide,
    };
    const { result } = renderHook(() => useFinalReview('r-7', transport));
    await act(async () => {
      await result.current.decide('approve');
    });
    expect(decide).toHaveBeenCalledWith('r-7', 'approve');
  });

  it('rejects decide() when no runId is active', async () => {
    const decide = vi.fn();
    const transport: FinalReviewTransport = {
      subscribe: () => () => {},
      decide,
    };
    const { result } = renderHook(() => useFinalReview(null, transport));
    await expect(result.current.decide('approve')).rejects.toThrow(/no active runId/i);
    expect(decide).not.toHaveBeenCalled();
  });
});
