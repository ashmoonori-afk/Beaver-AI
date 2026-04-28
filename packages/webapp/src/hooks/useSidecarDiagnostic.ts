// Surfaces a fast-fail diagnostic when the sidecar dies before
// inserting a `runs` row.
//
// Flow:
//  - User submits a goal → `tauriStartRun` returns a runId.
//  - The sidecar is supposed to insert a row into `runs` within ~1 s.
//  - If `runs_get(runId)` keeps returning null for &gt;5 s, something
//    went wrong before `Beaver.run().init()` finished. We pull the
//    tail of `<workspace>/.beaver/sidecar-stderr.log` so the user can
//    see Node's actual error message instead of staring at a blank
//    "Starting…" state.

import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { isTauri } from '../lib/tauriRuntime.js';
import type { RunSnapshot } from '../types.js';

const FAIL_THRESHOLD_MS = 5_000;
const REFRESH_MS = 2_000;

export interface SidecarDiagnostic {
  /** True when the run hasn't materialised in &gt; FAIL_THRESHOLD_MS. */
  showing: boolean;
  /** Tail of sidecar-stderr.log (last ~8 KB), or null while loading. */
  stderrTail: string | null;
}

export function useSidecarDiagnostic(
  activeRunId: string | null,
  snapshot: RunSnapshot | null,
): SidecarDiagnostic {
  const [showing, setShowing] = useState(false);
  const [stderrTail, setStderrTail] = useState<string | null>(null);

  // Watchdog: snapshot should arrive within FAIL_THRESHOLD_MS of
  // activeRunId being set. If it doesn't, flip `showing` so the card
  // mounts and starts refreshing the log tail.
  useEffect(() => {
    setShowing(false);
    setStderrTail(null);
    if (!activeRunId || !isTauri()) return;
    if (snapshot) return; // run materialised, no diagnostic needed
    const timer = setTimeout(() => setShowing(true), FAIL_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, [activeRunId, snapshot]);

  // Once `showing` flips, poll the log tail every REFRESH_MS. Stops
  // when the run finally materialises (snapshot becomes truthy) or
  // the user navigates away (activeRunId nulls).
  useEffect(() => {
    if (!showing || !activeRunId || !isTauri() || snapshot) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const tail = await invoke<string>('sidecar_log', { args: { tail_bytes: 8192 } });
        if (!cancelled) setStderrTail(tail);
      } catch {
        if (!cancelled) setStderrTail('');
      }
      if (!cancelled) setTimeout(tick, REFRESH_MS);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [showing, activeRunId, snapshot]);

  return { showing, stderrTail };
}
