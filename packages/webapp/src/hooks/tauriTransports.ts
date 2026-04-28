// Tauri-backed transport implementations.
//
// Phase 4D.2 wires only the run-snapshot path (the critical-path one
// for replacing the legacy launcher's CLI invocation). The other 5
// transports return safe fallbacks until 4D.2.x extends them.
//
// The Rust side is expected to expose:
//   - invoke('runs_start', { goal })            -> { runId }
//   - emit('run.snapshot.<runId>', snapshot)    repeatedly
//
// Other commands log a one-time warning and resolve with empty/null
// values so the UI keeps rendering instead of crashing in dev.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { RunSnapshot } from '../types.js';
import type { AskWikiTransport } from './useAskWiki.js';
import type { CheckpointTransport } from './useCheckpoints.js';
import type { EventsTransport } from './useEvents.js';
import type { FinalReviewTransport } from './useFinalReview.js';
import type { PlanListTransport } from './usePlanList.js';
import type { RunSnapshotTransport } from './useRunSnapshot.js';

export interface RunStartResult {
  runId: string;
}

/** Triggered by the GoalBox path. The Tauri shell spawns the CLI
 *  sidecar with the supplied goal and returns a fresh run id. */
export async function tauriStartRun(goal: string): Promise<RunStartResult> {
  return invoke<RunStartResult>('runs_start', { goal });
}

/** Real run-snapshot transport. Subscribes to Tauri events of the form
 *  `run.snapshot.<runId>` and forwards each payload to the hook. */
export function makeTauriRunSnapshotTransport(): RunSnapshotTransport {
  return {
    subscribe(runId, onSnapshot) {
      const channel = `run.snapshot.${runId}`;
      let cancel: (() => void) | null = null;
      // listen() is async; capture its returned unlisten fn so the
      // cleanup path always works even if the subscription resolves
      // after the component already unmounted.
      let cancelled = false;
      listen<RunSnapshot>(channel, (e) => {
        if (cancelled) return;
        onSnapshot(e.payload);
      })
        .then((unlisten) => {
          if (cancelled) {
            unlisten();
            return;
          }
          cancel = unlisten;
        })
        .catch((err: unknown) => {
          // Don't silently lose IPC failures: a rejected listen() means
          // the channel was never bound, so future emits will be dropped.
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.error(`[beaver/tauri] listen(${channel}) failed`, err);
        });
      return () => {
        cancelled = true;
        if (cancel) cancel();
      };
    },
  };
}

// --- not-yet-wired transports (4D.2.x) --------------------------------

let warned = new Set<string>();
function warnOnce(name: string): void {
  if (warned.has(name)) return;
  warned.add(name);
  // eslint-disable-next-line no-console
  console.warn(`[beaver/tauri] ${name} transport not yet wired (Phase 4D.2.x); UI will be empty.`);
}

export function makeTauriCheckpointTransport(): CheckpointTransport {
  return {
    subscribe(_runId, onList) {
      warnOnce('checkpoints');
      onList([]);
      return () => {};
    },
    answer(_id, _response) {
      return Promise.reject(new Error('checkpoints.answer not wired in Tauri yet (4D.2.x)'));
    },
  };
}

export function makeTauriEventsTransport(): EventsTransport {
  return {
    subscribe(_runId, _onEvent) {
      warnOnce('events');
      return () => {};
    },
  };
}

export function makeTauriPlanListTransport(): PlanListTransport {
  return {
    subscribe(_runId, onList) {
      warnOnce('plans');
      onList([]);
      return () => {};
    },
  };
}

export function makeTauriFinalReviewTransport(): FinalReviewTransport {
  return {
    subscribe(_runId, onReport) {
      warnOnce('final-review');
      onReport(null);
      return () => {};
    },
    decide(_runId, _decision) {
      return Promise.reject(new Error('final-review.decide not wired in Tauri yet (4D.2.x)'));
    },
  };
}

export function makeTauriAskWikiTransport(): AskWikiTransport {
  return {
    ask(_question, _signal) {
      warnOnce('wiki');
      return Promise.resolve({ text: '', citations: [], empty: true });
    },
  };
}

/** Reset the warn-once memo. Test-only. */
export function __resetWarnedForTest(): void {
  warned = new Set<string>();
}
