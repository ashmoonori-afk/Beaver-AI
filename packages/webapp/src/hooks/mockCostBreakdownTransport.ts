// Phase 1-D — in-memory cost breakdown for browser dev mode + tests.
// Mirrors the rough shape the SQLite query produces (sorted USD-desc).

import type { CostBreakdownEntry } from '../types.js';
import type { CostBreakdownTransport } from './useCostBreakdown.js';

const SAMPLE: readonly CostBreakdownEntry[] = [
  { phase: 'EXECUTING', usd: 0.42, tokensIn: 18_400, tokensOut: 6_200 },
  { phase: 'PLANNING', usd: 0.12, tokensIn: 4_400, tokensOut: 1_200 },
  { phase: 'REVIEWING', usd: 0.08, tokensIn: 2_800, tokensOut: 600 },
  { phase: 'REFINING_GOAL', usd: 0.04, tokensIn: 1_400, tokensOut: 220 },
];

export function makeMockCostBreakdownTransport(): CostBreakdownTransport {
  return {
    subscribe(_runId, onList) {
      onList(SAMPLE);
      return () => {};
    },
  };
}
