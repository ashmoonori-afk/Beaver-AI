// Single-shape data hook for the #review panel. Surfaces the final-report
// summary + an `answer(decision)` for approve/discard. Symmetric to
// useCheckpoints — injectable transport, no XHR/fetch in the hook itself.

import { useCallback, useEffect, useState } from 'react';

import type { FinalReportSummary } from '../types.js';

export type FinalReviewDecision = 'approve' | 'discard';

export interface FinalReviewTransport {
  /** Subscribe to the latest final-report for the run, or null while
   *  the orchestrator hasn't reached FINAL_REVIEW_PENDING yet. */
  subscribe(runId: string, onReport: (report: FinalReportSummary | null) => void): () => void;
  /** Apply the user's decision. Resolves on success; rejects with an
   *  Error whose message can surface in the UI. */
  decide(runId: string, decision: FinalReviewDecision): Promise<void>;
}

export interface UseFinalReviewResult {
  report: FinalReportSummary | null;
  decide: (decision: FinalReviewDecision) => Promise<void>;
}

export function useFinalReview(
  runId: string | null,
  transport: FinalReviewTransport,
): UseFinalReviewResult {
  const [report, setReport] = useState<FinalReportSummary | null>(null);

  useEffect(() => {
    setReport(null);
    if (!runId) return;
    const unsub = transport.subscribe(runId, setReport);
    return unsub;
  }, [runId, transport]);

  const decide = useCallback(
    (decision: FinalReviewDecision) => {
      if (!runId) return Promise.reject(new Error('decide: no active runId'));
      return transport.decide(runId, decision);
    },
    [runId, transport],
  );

  return { report, decide };
}
