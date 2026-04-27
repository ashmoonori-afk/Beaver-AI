// Single-shape data hook for the bento. The transport is injectable so
// the W.3 sprint ships against a mock subscriber, then 4D.2 swaps in
// the Tauri event-bus subscriber without touching components.

import { useEffect, useState } from 'react';

import type { RunSnapshot } from '../types.js';

export interface RunSnapshotTransport {
  /** Subscribe to a stream of snapshots for `runId`. Returns a cleanup
   *  fn the hook calls on unmount or runId change. */
  subscribe(runId: string, onSnapshot: (s: RunSnapshot) => void): () => void;
}

export function useRunSnapshot(
  runId: string | null,
  transport: RunSnapshotTransport,
): RunSnapshot | null {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);

  useEffect(() => {
    if (!runId) {
      setSnapshot(null);
      return;
    }
    const unsub = transport.subscribe(runId, setSnapshot);
    return unsub;
  }, [runId, transport]);

  return snapshot;
}
