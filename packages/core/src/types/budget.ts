// AgentBudget — the per-agent runtime cap passed in RunOptions.
// The layered defaults (per-agent / per-task / per-run) live in
// core/budget/schema.ts as BudgetConfig.

import { z } from 'zod';

export const AgentBudgetSchema = z.object({
  usd: z.number().positive(),
  warnThresholdPct: z.number().int().min(1).max(100).default(70),
});
export type AgentBudget = z.infer<typeof AgentBudgetSchema>;
