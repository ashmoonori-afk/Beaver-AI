// Cost / token ticker with a thin progress bar.
//
// Phase 8 (D19): dual-mode rendering. `tokens` mode (subscription-CLI
// default) shows ▼ in / ▲ out / ◇ cached lines + progress against
// tokenCap.total. `usd` mode (direct-API only, Phase 9 hookup) keeps
// the legacy $X.XX of $Y.YY display.
//
// Threshold semantics are the same in both modes:
//   pct >= 70%  → fill flips to accent-700 (warn)
//   pct >= 100% → fill flips to danger-500 (over cap)

import { cn } from '../lib/utils.js';
import type { CostMode, TokenCap, TokenUsage } from '../types.js';

const DEFAULT_TOKEN_CAP_TOTAL = 1_000_000;

export interface CostTickerProps {
  spentUsd: number;
  budgetUsd: number;
  /** Phase 8 — when costMode==='tokens' (default), the renderer uses these. */
  tokens?: TokenUsage;
  /** Phase 8 — token cap. Falls back to 1 M total when omitted. */
  tokenCap?: TokenCap;
  /** Phase 8 — selects display unit. Default 'tokens'. */
  costMode?: CostMode;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function classForPct(pct: number): string {
  if (pct >= 100) return 'bg-danger-500';
  if (pct >= 70) return 'bg-accent-700';
  return 'bg-accent-500';
}

export function CostTicker(props: CostTickerProps) {
  const mode: CostMode = props.costMode ?? 'tokens';
  if (mode === 'tokens' && props.tokens) {
    return (
      <TokensView
        tokens={props.tokens}
        {...(props.tokenCap !== undefined && { cap: props.tokenCap })}
      />
    );
  }
  return <UsdView spentUsd={props.spentUsd} budgetUsd={props.budgetUsd} />;
}

function UsdView({ spentUsd, budgetUsd }: { spentUsd: number; budgetUsd: number }) {
  const safeBudget = budgetUsd > 0 ? budgetUsd : 1;
  const pct = Math.min(100, (spentUsd / safeBudget) * 100);
  return (
    <div className="flex flex-col gap-1" aria-live="polite" data-testid="cost-ticker-usd">
      <span className="text-caption text-text-500">Spent</span>
      <div className="text-hero text-text-50 font-mono">${spentUsd.toFixed(2)}</div>
      <div className="text-caption text-text-500">of ${budgetUsd.toFixed(2)} cap</div>
      <ProgressBar pct={pct} />
    </div>
  );
}

interface TokensViewProps {
  tokens: TokenUsage;
  cap?: TokenCap;
}

function TokensView({ tokens, cap }: TokensViewProps) {
  const total = (cap?.total ?? DEFAULT_TOKEN_CAP_TOTAL) || 1;
  const billable = tokens.input + tokens.output;
  const pct = Math.min(100, (billable / total) * 100);
  return (
    <div className="flex flex-col gap-1" aria-live="polite" data-testid="cost-ticker-tokens">
      <span className="text-caption text-text-500">Tokens</span>
      <div className="text-hero text-text-50 font-mono">{formatTokens(billable)}</div>
      <div className="flex flex-col gap-0.5 text-caption text-text-500 font-mono">
        <span>
          <span aria-hidden>▼ </span>
          <span data-testid="tokens-input">{formatTokens(tokens.input)}</span> in
        </span>
        <span>
          <span aria-hidden>▲ </span>
          <span data-testid="tokens-output">{formatTokens(tokens.output)}</span> out
        </span>
        <span>
          <span aria-hidden>◇ </span>
          <span data-testid="tokens-cached">{formatTokens(tokens.cached)}</span> cached
        </span>
        <span>of {formatTokens(total)} cap</span>
      </div>
      <ProgressBar pct={pct} />
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-700"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className={cn('h-full transition-all', classForPct(pct))} style={{ width: `${pct}%` }} />
    </div>
  );
}

export const __test__ = { formatTokens, classForPct };
