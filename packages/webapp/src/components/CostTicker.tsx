// Cost spent vs cap, with a thin progress bar.
// 70% threshold (D7 default warnThresholdPct) flips the bar to amber-via-text;
// 100% flips it to danger.

import { cn } from '../lib/utils.js';

export interface CostTickerProps {
  spentUsd: number;
  budgetUsd: number;
}

export function CostTicker({ spentUsd, budgetUsd }: CostTickerProps) {
  const safeBudget = budgetUsd > 0 ? budgetUsd : 1;
  const pct = Math.min(100, (spentUsd / safeBudget) * 100);
  const overWarn = pct >= 70;
  const overCap = pct >= 100;
  const fillClass = overCap ? 'bg-danger-500' : overWarn ? 'bg-accent-700' : 'bg-accent-500';
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <span className="text-caption text-text-500">Spent</span>
      <div className="text-hero text-text-50 font-mono">${spentUsd.toFixed(2)}</div>
      <div className="text-caption text-text-500">of ${budgetUsd.toFixed(2)} cap</div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-700"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className={cn('h-full transition-all', fillClass)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
