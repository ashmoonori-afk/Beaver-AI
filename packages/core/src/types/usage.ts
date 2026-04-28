// Usage / CostEstimate per docs/models/cost-budget.md.
// Internal tracking is (tokensIn, tokensOut, model); USD is derived
// per ProviderAdapter.cost() against the rate_table.
//
// Phase 8 (D19 proposed): cachedInputTokens added so subscription-CLI
// users see real cache hit metrics. The legacy fields stay because
// existing code paths sum them; cached tokens are a separate signal
// for the cost ticker.

import { z } from 'zod';

export const UsageSchema = z.object({
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  /**
   * Phase 8 — number of input tokens served from prompt cache.
   * Anthropic exposes `cache_read_input_tokens`; OpenAI exposes
   * `prompt_tokens_details.cached_tokens`. Optional so producers that
   * predate Phase 8 (mock-cli, older fixtures) keep parsing — readers
   * default to 0 via `cachedInputTokensOf()`.
   */
  cachedInputTokens: z.number().int().nonnegative().optional(),
  model: z.string().min(1),
});
export type Usage = z.infer<typeof UsageSchema>;

export const CostEstimateSchema = z.object({
  usd: z.number().nonnegative(),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
  /** Phase 8 — separately reported so the UI can show cache hits. */
  cachedInputTokens: z.number().int().nonnegative().optional(),
});
export type CostEstimate = z.infer<typeof CostEstimateSchema>;

/**
 * Read `cachedInputTokens` with a 0 default so Phase 8 readers don't
 * have to repeat the `?? 0` everywhere. Callers that produce usage rows
 * still get to omit the field when their source has no cache signal.
 */
export function cachedInputTokensOf(u: Pick<Usage, 'cachedInputTokens'>): number {
  return u.cachedInputTokens ?? 0;
}
