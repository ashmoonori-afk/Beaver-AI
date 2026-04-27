// Usage / CostEstimate per docs/models/cost-budget.md.
// Internal tracking is (tokensIn, tokensOut, model); USD is derived
// per ProviderAdapter.cost() against the rate_table.

import { z } from 'zod';

export const UsageSchema = z.object({
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  model: z.string().min(1),
});
export type Usage = z.infer<typeof UsageSchema>;

export const CostEstimateSchema = z.object({
  usd: z.number().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
});
export type CostEstimate = z.infer<typeof CostEstimateSchema>;
