// In-memory final-review transport for the W.5 demo + tests. Emits one
// FinalReportSummary on subscribe. `decide()` flips internal state so a
// re-subscriber sees null after a successful approve/discard. Replaced
// by the Tauri transport in 4D.2.

import type { FinalReportSummary } from '../types.js';
import type { FinalReviewTransport } from './useFinalReview.js';

const DEFAULT_MARKDOWN = `# Run summary

The run finished successfully. Two branches landed:

- \`beaver/r-1/coder\` — adds the /api/users route + tests.
- \`beaver/r-1/reviewer\` — improved error messages.

See the diff stats above for size deltas.`;

function defaultReport(runId: string): FinalReportSummary {
  return {
    runId,
    generatedAt: new Date().toISOString(),
    markdown: DEFAULT_MARKDOWN,
    branches: [
      {
        ref: `beaver/${runId}/coder`,
        agentRole: 'coder',
        diff: { filesChanged: 4, insertions: 132, deletions: 12 },
      },
      {
        ref: `beaver/${runId}/reviewer`,
        agentRole: 'reviewer',
        diff: { filesChanged: 2, insertions: 18, deletions: 6 },
      },
    ],
  };
}

export function makeMockFinalReviewTransport(): FinalReviewTransport {
  const reports = new Map<string, FinalReportSummary | null>();
  const listeners = new Map<string, Set<(r: FinalReportSummary | null) => void>>();

  function emit(runId: string): void {
    const subs = listeners.get(runId);
    if (!subs) return;
    const r = reports.get(runId) ?? null;
    for (const fn of subs) fn(r);
  }

  return {
    subscribe(runId, onReport) {
      if (!reports.has(runId)) reports.set(runId, defaultReport(runId));
      const subs = listeners.get(runId) ?? new Set();
      subs.add(onReport);
      listeners.set(runId, subs);
      onReport(reports.get(runId) ?? null);
      return () => {
        subs.delete(onReport);
        if (subs.size === 0) listeners.delete(runId);
      };
    },
    async decide(runId, _decision) {
      if (!reports.has(runId)) throw new Error(`decide: no report for runId='${runId}'`);
      reports.set(runId, null);
      emit(runId);
    },
  };
}
