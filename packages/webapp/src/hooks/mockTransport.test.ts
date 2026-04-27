import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

import { makeMockTransport } from './mockTransport.js';
import type { RunSnapshot } from '../types.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('makeMockTransport', () => {
  it('emits PLANNING immediately on subscribe', () => {
    const transport = makeMockTransport('build a landing page');
    const seen: RunSnapshot[] = [];
    transport.subscribe('r-1', (s) => seen.push(s));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.state).toBe('PLANNING');
    expect(seen[0]?.runId).toBe('r-1');
    expect(seen[0]?.agents[0]?.role).toBe('planner');
  });

  it('walks PLANNING -> EXECUTING -> COMPLETED at 1500ms ticks', () => {
    const transport = makeMockTransport('demo goal');
    const seen: RunSnapshot[] = [];
    transport.subscribe('r-1', (s) => seen.push(s));
    vi.advanceTimersByTime(1500);
    vi.advanceTimersByTime(1500);
    expect(seen.map((s) => s.state)).toEqual(['PLANNING', 'EXECUTING', 'COMPLETED']);
    const last = seen.at(-1)!;
    expect(last.endedAt).toBeDefined();
    expect(last.agents).toHaveLength(2);
  });

  it('cancels remaining ticks when the cleanup is called', () => {
    const transport = makeMockTransport('demo goal');
    const seen: RunSnapshot[] = [];
    const unsub = transport.subscribe('r-1', (s) => seen.push(s));
    unsub();
    vi.advanceTimersByTime(5000);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.state).toBe('PLANNING');
  });

  it('truncates the goal to 60 chars in the planner lastLine', () => {
    const longGoal = 'x'.repeat(200);
    const transport = makeMockTransport(longGoal);
    const seen: RunSnapshot[] = [];
    transport.subscribe('r-1', (s) => seen.push(s));
    const planning = seen[0]!;
    const planner = planning.agents[0]!;
    expect(planner.lastLine?.length).toBeLessThanOrEqual('Planning: '.length + 60);
  });
});
