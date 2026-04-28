// One-glyph state badge. Color comes from a tiny lookup, not from the
// state name — keeps the component's contract narrow and unit-testable.

import { cn } from '../lib/utils.js';
import type { RunState } from '../types.js';

const STATE_CLASS: Record<RunState, string> = {
  INITIALIZED: 'bg-surface-700 text-text-300',
  REFINING_GOAL: 'bg-accent-700 text-text-50',
  PLANNING: 'bg-accent-700 text-text-50',
  EXECUTING: 'bg-accent-500 text-surface-900',
  REVIEWING: 'bg-accent-700 text-text-50',
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
  FINAL_REVIEW_PENDING: '✓',
  COMPLETED: '✓',
  FAILED: '×',
  ABORTED: '×',
};

export function StateBadge({ state }: { state: RunState }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-text-500">State</span>
      <div
        className={cn(
          'inline-flex items-center gap-2 rounded-card px-3 py-1.5 text-body font-medium transition-colors',
          STATE_CLASS[state],
        )}
        aria-label={`Run state: ${state}`}
      >
        <span aria-hidden>{STATE_GLYPH[state]}</span>
        <span>{state}</span>
      </div>
    </div>
  );
}
