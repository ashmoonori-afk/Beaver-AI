// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';

import { useAskWiki, type AskWikiTransport } from './useAskWiki.js';
import type { WikiAnswer } from '../types.js';

afterEach(() => {
  cleanup();
});

function answer(overrides: Partial<WikiAnswer> = {}): WikiAnswer {
  return { text: 'hi', citations: [], empty: false, ...overrides };
}

describe('useAskWiki', () => {
  it('starts in idle state and never asks for an empty question', async () => {
    const ask = vi.fn();
    const transport: AskWikiTransport = { ask };
    const { result } = renderHook(() => useAskWiki('   ', transport, { debounceMs: 0 }));
    expect(result.current.status).toBe('idle');
    await new Promise((r) => setTimeout(r, 20));
    expect(ask).not.toHaveBeenCalled();
  });

  it('debounces the call by the configured delay', async () => {
    vi.useFakeTimers();
    try {
      const ask = vi.fn().mockResolvedValue(answer());
      const transport: AskWikiTransport = { ask };
      renderHook(() => useAskWiki('hi', transport, { debounceMs: 250 }));
      vi.advanceTimersByTime(200);
      expect(ask).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60);
      expect(ask).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces the answer once the transport resolves', async () => {
    const ask = vi.fn().mockResolvedValue(answer({ text: 'shipped' }));
    const transport: AskWikiTransport = { ask };
    const { result } = renderHook(() => useAskWiki('q', transport, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status === 'ready') {
      expect(result.current.answer.text).toBe('shipped');
    }
  });

  it('exposes the rejection message on error', async () => {
    const ask = vi.fn().mockRejectedValue(new Error('boom'));
    const transport: AskWikiTransport = { ask };
    const { result } = renderHook(() => useAskWiki('q', transport, { debounceMs: 0 }));
    await waitFor(() => expect(result.current.status).toBe('error'));
    if (result.current.status === 'error') {
      expect(result.current.message).toBe('boom');
    }
  });

  it('aborts the in-flight request when the question changes', async () => {
    const seen: AbortSignal[] = [];
    const transport: AskWikiTransport = {
      ask(_q, signal) {
        seen.push(signal);
        return new Promise(() => {});
      },
    };
    const { rerender } = renderHook(
      ({ q }: { q: string }) => useAskWiki(q, transport, { debounceMs: 0 }),
      { initialProps: { q: 'first' } },
    );
    await waitFor(() => expect(seen.length).toBeGreaterThan(0));
    rerender({ q: 'second' });
    await waitFor(() => expect(seen[0]?.aborted).toBe(true));
  });
});
