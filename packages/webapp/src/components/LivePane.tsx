// Right panel: Phase Timeline + cost counter + log lines. v0.2 M3.2.
//
// Carries the existing PhaseTimeline component (moved here from the
// Status panel per PRD M3.2) and reserves space for the M3.4 cost
// counter and M3.3 log list. The actual log + cost wiring lands in
// later iters of M3 — for M3.1+M3.2 we just compose what's already
// shipping under v0.1.

import type { ReactNode } from 'react';

import { PhaseTimeline } from './PhaseTimeline.js';
import type { LogEvent, RunSnapshot } from '../types.js';

export interface LivePaneProps {
  events: LogEvent[];
  snapshot: RunSnapshot | null;
  /** v0.2 M3.4 cost counter, supplied by the shell when ready. */
  costCounter?: ReactNode;
  /** v0.2 M3.3 live log list, supplied by the shell when ready. */
  logList?: ReactNode;
}

export function LivePane({ events, snapshot, costCounter, logList }: LivePaneProps) {
  return (
    <div className="flex h-full flex-col gap-4 px-4 py-6" data-testid="live-pane">
      <h2 className="text-caption uppercase tracking-wide text-text-500">Live</h2>
      <PhaseTimeline events={events} currentState={snapshot?.state ?? 'INITIALIZED'} />
      {costCounter ? (
        <div className="rounded-card border border-surface-700 bg-surface-800 p-3">
          {costCounter}
        </div>
      ) : null}
      {logList ? (
        <div className="flex flex-1 flex-col rounded-card border border-surface-700 bg-surface-800 p-3">
          <h3 className="mb-2 text-caption uppercase tracking-wide text-text-500">Agent log</h3>
          {logList}
        </div>
      ) : null}
    </div>
  );
}
