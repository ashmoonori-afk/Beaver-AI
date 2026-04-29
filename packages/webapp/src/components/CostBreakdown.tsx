// Phase 1-D — segmented bar + per-phase rows showing where a run's
// spend went. Sourced from `useCostBreakdown` (poll-based SQLite).
//
// Design choices:
// - Stacked bar (not pie) so eye-balling proportions across runs is
//   easier and we keep horizontal layout in the Bento.
// - Phase colors mirror the StateBadge palette so a user who sees
//   "EXECUTING" green in the badge recognises the green segment.
// - Show empty state ("no spend yet") as a thin neutral bar so the
//   slot doesn't collapse — the section's height stays stable across
//   polls.

import type { CostBreakdownEntry } from '../types.js';

export interface CostBreakdownProps {
  entries: readonly CostBreakdownEntry[];
}

const PHASE_COLOR: Record<string, string> = {
  INITIALIZED: 'bg-text-500',
  REFINING_GOAL: 'bg-accent-300',
  PLANNING: 'bg-accent-500',
  EXECUTING: 'bg-accent-600',
  REVIEWING: 'bg-accent-700',
  FINAL_REVIEW_PENDING: 'bg-accent-400',
  UNKNOWN: 'bg-surface-600',
};

const PHASE_LABEL: Record<string, string> = {
  INITIALIZED: 'Init',
  REFINING_GOAL: 'Refine',
  PLANNING: 'Plan',
  EXECUTING: 'Execute',
  REVIEWING: 'Review',
  FINAL_REVIEW_PENDING: 'Final review',
  UNKNOWN: 'Unknown',
};

function colorForPhase(phase: string): string {
  return PHASE_COLOR[phase] ?? 'bg-surface-600';
}

function labelForPhase(phase: string): string {
  return PHASE_LABEL[phase] ?? phase.toLowerCase().replace(/_/g, ' ');
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function CostBreakdown({ entries }: CostBreakdownProps) {
  const totalUsd = entries.reduce((sum, e) => sum + e.usd, 0);
  const hasSpend = totalUsd > 0;

  return (
    <section
      data-testid="cost-breakdown"
      aria-label="Cost breakdown by phase"
      className="rounded-card bg-surface-800 px-4 py-3"
    >
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-caption text-text-500">Spend by phase</h2>
        <span className="text-caption text-text-500 font-mono">${totalUsd.toFixed(4)}</span>
      </div>
      {hasSpend ? (
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-surface-700"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={100}
          aria-label="Stacked spend by phase"
        >
          {entries.map((e) => {
            // Round to 2 decimals so the inline style is stable across
            // FP edge cases (e.g. 0.6/1.0*100 = 60.00000000000001).
            const pct = ((e.usd / totalUsd) * 100).toFixed(2);
            return (
              <div
                key={e.phase}
                data-testid={`cost-bar-${e.phase}`}
                className={`${colorForPhase(e.phase)} h-full transition-all`}
                style={{ width: `${pct}%` }}
                title={`${labelForPhase(e.phase)}: $${e.usd.toFixed(4)}`}
              />
            );
          })}
        </div>
      ) : (
        <div className="h-2 w-full rounded-full bg-surface-700" aria-label="No spend yet" />
      )}
      {hasSpend ? (
        <ul className="mt-3 grid grid-cols-1 gap-1 text-caption sm:grid-cols-2">
          {entries.map((e) => {
            const pct = (e.usd / totalUsd) * 100;
            return (
              <li
                key={e.phase}
                data-testid={`cost-row-${e.phase}`}
                className="flex items-center justify-between gap-2 rounded-card px-2 py-1 hover:bg-surface-700/50"
              >
                <span className="flex items-center gap-2 text-text-300">
                  <span
                    aria-hidden
                    className={`inline-block h-2 w-2 rounded-full ${colorForPhase(e.phase)}`}
                  />
                  <span>{labelForPhase(e.phase)}</span>
                </span>
                <span className="flex items-center gap-2 font-mono text-text-500">
                  <span data-testid={`cost-pct-${e.phase}`}>{pct.toFixed(1)}%</span>
                  <span data-testid={`cost-usd-${e.phase}`}>${e.usd.toFixed(4)}</span>
                  <span className="hidden sm:inline" data-testid={`cost-tokens-${e.phase}`}>
                    ▼{formatTokens(e.tokensIn)} ▲{formatTokens(e.tokensOut)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-caption text-text-500">
          No spend yet — run hasn't billed any LLM calls.
        </p>
      )}
    </section>
  );
}

export const __test__ = { colorForPhase, labelForPhase, formatTokens };
