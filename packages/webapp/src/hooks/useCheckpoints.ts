// Single-shape data hook for the #checkpoints panel. Symmetric with
// `useRunSnapshot`: the transport is injectable so the W.4 sprint
// ships against a mock and 4D.2 swaps in the Tauri event bus.

import { useCallback, useEffect, useState } from 'react';

import type { CheckpointSummary } from '../types.js';

export interface CheckpointTransport {
  /** Subscribe to the current pending list. Re-emits whenever the list
   *  changes (e.g. after an answer removes a row). */
  subscribe(runId: string, onList: (list: readonly CheckpointSummary[]) => void): () => void;
  /** POST an answer for a pending checkpoint. Resolves on success;
   *  rejects with an Error whose message can be shown to the user. */
  answer(id: string, response: string): Promise<void>;
}

export interface UseCheckpointsResult {
  checkpoints: readonly CheckpointSummary[];
  answer: (id: string, response: string) => Promise<void>;
}

export function useCheckpoints(
  runId: string | null,
  transport: CheckpointTransport,
): UseCheckpointsResult {
  const [checkpoints, setCheckpoints] = useState<readonly CheckpointSummary[]>([]);

  useEffect(() => {
    setCheckpoints([]);
    if (!runId) return;
    const unsub = transport.subscribe(runId, setCheckpoints);
    return unsub;
  }, [runId, transport]);

  const answer = useCallback(
    (id: string, response: string) => transport.answer(id, response),
    [transport],
  );

  return { checkpoints, answer };
}
