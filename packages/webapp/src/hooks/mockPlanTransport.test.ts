import { describe, it, expect } from 'vitest';

import { makeMockPlanTransport } from './mockPlanTransport.js';
import type { PlanSummary } from '../types.js';

describe('makeMockPlanTransport', () => {
  it('emits a sorted list (newest version first) on subscribe', () => {
    const transport = makeMockPlanTransport();
    const seen: PlanSummary[][] = [];
    transport.subscribe('r-1', (list) => seen.push([...list]));
    expect(seen).toHaveLength(1);
    const versions = seen[0]!.map((p) => p.version);
    expect(versions).toEqual([2, 1]);
    expect(seen[0]!.every((p) => p.runId === 'r-1')).toBe(true);
  });

  it('returns a no-op cleanup function', () => {
    const transport = makeMockPlanTransport();
    const unsub = transport.subscribe('r-1', () => {});
    expect(typeof unsub).toBe('function');
    expect(() => unsub()).not.toThrow();
  });
});
