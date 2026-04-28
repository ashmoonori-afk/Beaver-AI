// Provider-mode selection (Phase 9 — D20 proposed).
//
// `BEAVER_PROVIDER_MODE` env var picks between the spawn-CLI providers
// (default, v0.1) and the direct-SDK adapter (v0.2 / Phase 9).
//
// `costMode` for the renderer follows from the provider mode: CLI mode
// is subscription-billed so tokens are the honest unit; API mode is
// USD-billed so $ becomes meaningful. The webapp reads `costMode` off
// the snapshot, so the orchestrator just needs to set it correctly
// when constructing RunSnapshot.

export type ProviderMode = 'cli' | 'api';

export type CostMode = 'tokens' | 'usd';

/** Read `BEAVER_PROVIDER_MODE`. Defaults to 'cli' (the v0.1 path). */
export function providerMode(env: NodeJS.ProcessEnv = process.env): ProviderMode {
  const raw = env.BEAVER_PROVIDER_MODE?.toLowerCase().trim();
  return raw === 'api' ? 'api' : 'cli';
}

/** The cost unit a given provider mode bills against. */
export function costModeFor(mode: ProviderMode): CostMode {
  return mode === 'api' ? 'usd' : 'tokens';
}

/** Validate that the API mode has the keys it needs. Throws with an
 *  actionable message when called in API mode without ANTHROPIC_API_KEY
 *  AND OPENAI_API_KEY (orchestrator may need both for fallback). */
export function assertApiKeysPresent(env: NodeJS.ProcessEnv = process.env): void {
  const missing: string[] = [];
  if (!env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
  if (!env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (missing.length === 0) return;
  throw new Error(
    `BEAVER_PROVIDER_MODE=api requires API keys to be set: missing ${missing.join(', ')}. ` +
      `Set them in the environment, or unset BEAVER_PROVIDER_MODE to fall back to CLI mode.`,
  );
}
