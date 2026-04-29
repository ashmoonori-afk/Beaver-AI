// Phase 1-C — surfaces in-progress runs so the user can pick them up
// after closing/reopening the app.
//
// Trigger: app launch detects any run in a non-terminal status
// (RUNNING / PAUSED / executing-states) AND no active selection. If
// there's exactly one we pre-fill it; if multiple, we show the most
// recent one (the runs sidebar still shows the rest).

import type { RunHistoryItem } from '../hooks/useRunsList.js';

const NON_TERMINAL = new Set([
  'INITIALIZED',
  'REFINING_GOAL',
  'PLANNING',
  'EXECUTING',
  'REVIEWING',
  'FINAL_REVIEW_PENDING',
]);

export interface ResumeBannerProps {
  /** Most recent non-terminal run, or null when nothing to resume. */
  candidate: RunHistoryItem | null;
  onResume: (runId: string) => void;
  onAbort: (runId: string) => void;
  onDismiss: () => void;
}

/** Compute the resume candidate from a runs list. Returns null when
 *  no run is in a non-terminal state. */
export function findResumeCandidate(runs: readonly RunHistoryItem[]): RunHistoryItem | null {
  // runs are pre-sorted by started_at DESC.
  return runs.find((r) => NON_TERMINAL.has(r.status)) ?? null;
}

export function ResumeBanner({ candidate, onResume, onAbort, onDismiss }: ResumeBannerProps) {
  if (!candidate) return null;

  const goalSnippet =
    candidate.goal.length > 80 ? `${candidate.goal.slice(0, 80)}…` : candidate.goal;
  const status = candidate.status.toLowerCase().replace(/_/g, ' ');

  return (
    <div
      role="region"
      aria-label="Resume in-progress run"
      className="mx-6 mt-3 flex items-start gap-3 rounded-card border border-blue-500/40 bg-blue-950/30 px-4 py-3 text-blue-50"
    >
      <div className="flex-1">
        <p className="text-body font-semibold">There's a run in progress</p>
        <p className="mt-1 text-caption opacity-90">
          <span className="opacity-70">"{goalSnippet}"</span>{' '}
          <span className="text-blue-200">— {status}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => onResume(candidate.id)}
        className="rounded-card border border-current px-3 py-1 text-caption transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        Resume
      </button>
      <button
        type="button"
        onClick={() => onAbort(candidate.id)}
        className="rounded-card border border-red-300/60 px-3 py-1 text-caption text-red-100 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        Abort
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss resume notice"
        className="rounded-card px-2 py-1 text-caption opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        ×
      </button>
    </div>
  );
}
