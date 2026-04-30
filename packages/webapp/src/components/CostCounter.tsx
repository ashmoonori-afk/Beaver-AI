// LivePane cost counter. v0.2 M3.4.
//
// Renders running token + USD totals + a soft progress bar against a
// budget cap. Pure presentation — the totals come from useCostTotals.

import type { CostTotals } from '../hooks/useCostTotals.js';

const TOKEN_FMT = new Intl.NumberFormat('en-US');
const USD_FMT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface CostCounterProps {
  totals: CostTotals;
  /** Budget cap in USD. Defaults to 5 (PRD §7.1 mock shows $5.00). */
  budgetUsd?: number;
}

export function CostCounter({ totals, budgetUsd = 5 }: CostCounterProps) {
  const fraction = budgetUsd > 0 ? Math.min(1, totals.usd / budgetUsd) : 0;
  const overBudget = totals.usd > budgetUsd;
  const totalTokens = totals.tokensIn + totals.tokensOut;
  return (
    <div className="flex flex-col gap-2" data-testid="cost-counter">
      <div className="flex items-baseline justify-between text-caption">
        <span className="text-text-500">Tokens</span>
        <span className="text-text-50 tabular-nums">{TOKEN_FMT.format(totalTokens)}</span>
      </div>
      <div className="flex items-baseline justify-between text-caption">
        <span className="text-text-500">Cost</span>
        <span className={`tabular-nums ${overBudget ? 'text-danger-500' : 'text-text-50'}`}>
          {USD_FMT.format(totals.usd)} / {USD_FMT.format(budgetUsd)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Spend against budget"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded bg-surface-700"
      >
        <div
          className={`h-full transition-all ${overBudget ? 'bg-danger-500' : 'bg-accent-500'}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
    </div>
  );
}
