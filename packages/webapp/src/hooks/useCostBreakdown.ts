// Phase 1-D — per-phase spend breakdown for a run. Symmetric with
// usePlanList / useRunSnapshot: the transport polls SQLite via Tauri
// (see tauriTransports.ts) and pushes a fresh list every tick. Tests
// inject a synchronous mock and call `act(push)` directly.

import { useEffect, useState } from 'react';

import type { CostBreakdownEntry } from '../types.js';

export interface CostBreakdownTransport {
  /** Subscribe to the per-phase cost breakdown for `runId`. Entries
   *  arrive sorted USD-desc (the SQLite query does the ordering). */
  subscribe(runId: string, onList: (list: readonly CostBreakdownEntry[]) => void): () => void;
}

export function useCostBreakdown(
  runId: string | null,
  transport: CostBreakdownTransport,
): readonly CostBreakdownEntry[] {
  const [list, setList] = useState<readonly CostBreakdownEntry[]>([]);

  useEffect(() => {
    setList([]);
    if (!runId) return;
    const unsub = transport.subscribe(runId, setList);
    return unsub;
  }, [runId, transport]);

  return list;
}
