// BudgetConfig — layered USD caps per docs/models/cost-budget.md.
// Three nested layers: per-agent < per-task < per-run.
// Hard cap on the run posts a `budget-exceeded` checkpoint.
//
// Defaults are initial values, not measured constants — see the doc note.
// They will be revisited after the first reference runs land.

import { z } from 'zod';

export const BudgetConfigSchema = z.object({
  perAgentUsd: z.number().positive().default(1.0),
  perTaskUsd: z.number().positive().default(3.0),
  perRunUsd: z.number().positive().default(20.0),
  warnThresholdPct: z.number().int().min(1).max(100).default(70),
});
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;

/** Canonical defaults table from the doc, exported as a frozen object. */
export const BUDGET_DEFAULTS: Readonly<BudgetConfig> = Object.freeze({
  perAgentUsd: 1.0,
  perTaskUsd: 3.0,
  perRunUsd: 20.0,
  warnThresholdPct: 70,
});
