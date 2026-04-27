// Per-call USD conversion against the rate_table.
// Pure persistence read — no business decisions about budgets here
// (those live in the adapter / runtime / orchestrator).

import { getCurrentRate } from '../workspace/dao/rate_table.js';
import type { Db } from '../workspace/db.js';
import type { CostEstimate, Usage } from '../types/usage.js';

export interface ComputeCostOptions {
  /** Provider key in rate_table, e.g. 'claude-code'. */
  provider: string;
  /** ISO 8601 effective-from cutoff. Defaults to now. */
  asOf?: string;
}

export function computeCost(db: Db, usage: Usage, opts: ComputeCostOptions): CostEstimate {
  const asOf = opts.asOf ?? new Date().toISOString();
  const rate = getCurrentRate(db, opts.provider, usage.model, asOf);
  if (!rate) {
    throw new Error(
      `no rate_table entry for provider=${opts.provider} model=${usage.model} as of ${asOf}`,
    );
  }
  const usd = usage.tokensIn / rate.tokens_in_per_usd + usage.tokensOut / rate.tokens_out_per_usd;
  return { usd, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut };
}
