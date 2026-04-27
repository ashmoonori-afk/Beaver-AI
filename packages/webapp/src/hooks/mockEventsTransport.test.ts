import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { makeMockEventsTransport } from './mockEventsTransport.js';
import type { LogEvent } from '../types.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('makeMockEventsTransport', () => {
  it('emits the first event synchronously and the rest at 400ms ticks', () => {
    const transport = makeMockEventsTransport();
    const seen: LogEvent[] = [];
    transport.subscribe('r-1', (e) => seen.push(e));
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(400);
    vi.advanceTimersByTime(400);
    expect(seen).toHaveLength(4);
  });

  it('cancels remaining ticks when cleanup is called', () => {
    const transport = makeMockEventsTransport();
    const seen: LogEvent[] = [];
    const unsub = transport.subscribe('r-1', (e) => seen.push(e));
    unsub();
    vi.advanceTimersByTime(5000);
    expect(seen).toHaveLength(1);
  });

  it('attaches the runId and a non-empty raw NDJSON payload', () => {
    const transport = makeMockEventsTransport();
    const seen: LogEvent[] = [];
    transport.subscribe('r-7', (e) => seen.push(e));
    expect(seen[0]?.runId).toBe('r-7');
    expect(seen[0]?.raw && seen[0]!.raw.length > 0).toBe(true);
    expect(() => JSON.parse(seen[0]!.raw!)).not.toThrow();
  });
});
