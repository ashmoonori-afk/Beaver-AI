// One-glyph state badge. Color comes from a tiny lookup, not from the
// state name — keeps the component's contract narrow and unit-testable.
//
// Phase 3-B: non-terminal states get a small pulsing dot so a glance
// at the badge says "something is happening right now" even before
// the user reads the label.

import { cn } from '../lib/utils.js';
import type { RunState } from '../types.js';

const ACTIVE_STATES: ReadonlySet<RunState> = new Set<RunState>([
  'REFINING_GOAL',
  'PLANNING',
  'EXECUTING',
  'REVIEWING',
  'INTEGRATING',
]);

// Phase 3-E — one-shot animation on terminal states. We pick the
// class once per render based on `state`; the keyframe runs once
// (no `iteration-count: infinite`) so the badge settles after the
// initial transition. `motion-safe:` so users with prefers-reduced-
// motion don't see anything jumpy.
function terminalAnimation(state: RunState): string {
  if (state === 'COMPLETED') return 'motion-safe:animate-celebrate';
  if (state === 'FAILED' || state === 'ABORTED') return 'motion-safe:animate-shake';
  return '';
}

const STATE_CLASS: Record<RunState, string> = {
  INITIALIZED: 'bg-surface-700 text-text-300',
  REFINING_GOAL: 'bg-accent-700 text-text-50',
  PLANNING: 'bg-accent-700 text-text-50',
  EXECUTING: 'bg-accent-500 text-surface-900',
  REVIEWING: 'bg-accent-700 text-text-50',
  INTEGRATING: 'bg-accent-600 text-text-50',
  FINAL_REVIEW_PENDING: 'bg-accent-700 text-text-50',
  COMPLETED: 'bg-accent-500 text-surface-900',
  FAILED: 'bg-danger-500 text-text-50',
  ABORTED: 'bg-danger-400 text-text-50',
};

const STATE_GLYPH: Record<RunState, string> = {
  INITIALIZED: '·',
  REFINING_GOAL: '?',
  PLANNING: '✎',
  EXECUTING: '▶',
  REVIEWING: '?',
  INTEGRATING: '⤳',
  FINAL_REVIEW_PENDING: '✓',
  COMPLETED: '✓',
  FAILED: '×',
  ABORTED: '×',
};

export function StateBadge({ state }: { state: RunState }) {
  const isActive = ACTIVE_STATES.has(state);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-text-500">State</span>
      <div
        // The key prop forces React to remount the badge whenever the
        // FSM state changes, which restarts the keyframe animation on
        // each terminal transition (otherwise React would keep the
        // node and skip the animation).
        key={state}
        className={cn(
          'inline-flex items-center gap-2 rounded-card px-3 py-1.5 text-body font-medium transition-colors',
          STATE_CLASS[state],
          terminalAnimation(state),
        )}
        aria-label={`Run state: ${state}`}
      >
        {isActive ? (
          <span
            data-testid="state-badge-live-dot"
            aria-hidden
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-current"
          />
        ) : (
          <span aria-hidden>{STATE_GLYPH[state]}</span>
        )}
        <span>{state}</span>
      </div>
    </div>
  );
}
