// Single-shape data hook for the #plan panel. Symmetric with
// useRunSnapshot / useCheckpoints — injectable transport so the W.5
// sprint ships against a mock and 4D.2 swaps in the Tauri event bus.

import { useEffect, useState } from 'react';

import type { PlanSummary } from '../types.js';

export interface PlanListTransport {
  /** Subscribe to the plan version list for `runId`. The list is sorted
   *  newest-first; latest version sits at index 0. */
  subscribe(runId: string, onList: (list: readonly PlanSummary[]) => void): () => void;
}

export function usePlanList(
  runId: string | null,
  transport: PlanListTransport,
): readonly PlanSummary[] {
  const [list, setList] = useState<readonly PlanSummary[]>([]);

  useEffect(() => {
    setList([]);
    if (!runId) return;
    const unsub = transport.subscribe(runId, setList);
    return unsub;
  }, [runId, transport]);

  return list;
}
