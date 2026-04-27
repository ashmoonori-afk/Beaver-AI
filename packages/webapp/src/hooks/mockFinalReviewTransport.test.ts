import { describe, it, expect } from 'vitest';

import { makeMockFinalReviewTransport } from './mockFinalReviewTransport.js';
import type { FinalReportSummary } from '../types.js';

describe('makeMockFinalReviewTransport', () => {
  it('emits a seeded report immediately on subscribe', () => {
    const transport = makeMockFinalReviewTransport();
    const seen: Array<FinalReportSummary | null> = [];
    transport.subscribe('r-1', (r) => seen.push(r));
    expect(seen[0]?.runId).toBe('r-1');
    expect(seen[0]?.branches.length).toBeGreaterThan(0);
    expect(seen[0]?.markdown).toMatch(/Run summary/i);
  });

  it('clears the report after decide() resolves', async () => {
    const transport = makeMockFinalReviewTransport();
    const seen: Array<FinalReportSummary | null> = [];
    transport.subscribe('r-1', (r) => seen.push(r));
    await transport.decide('r-1', 'approve');
    expect(seen.at(-1)).toBeNull();
  });

  it('rejects decide() for an unknown runId', async () => {
    const transport = makeMockFinalReviewTransport();
    await expect(transport.decide('does-not-exist', 'discard')).rejects.toThrow(/no report/i);
  });

  it('rejects a second decide() for the same run (idempotency guard)', async () => {
    const transport = makeMockFinalReviewTransport();
    transport.subscribe('r-1', () => {});
    await transport.decide('r-1', 'approve');
    await expect(transport.decide('r-1', 'approve')).rejects.toThrow(/already decided/i);
  });
});
