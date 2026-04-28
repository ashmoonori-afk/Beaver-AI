// Direct-API provider adapter (Phase 9 — D20 proposed).
//
// Parallel to ClaudeCodeAdapter / CodexAdapter, but instead of spawning
// the vendor CLI as a child process this calls the vendor SDK directly.
// Selection happens via the `providerMode()` helper which reads the
// BEAVER_PROVIDER_MODE env var.
//
// The actual SDK calls live in an extension that's installed only when
// the API mode is enabled — the core package stays free of the
// @anthropic-ai/sdk and openai dependencies so v0.1 (CLI mode) builds
// don't drag them along. See `loadDirectApiClient()` below.
//
// **In-session scope:** the adapter shape is wired and tested. The
// actual `run()` body is a stub that throws with an actionable message
// directing the user back to CLI mode until the SDK extension lands.
// OS sandbox + real-LLM nightly CI gate stay deferred to v0.2.

import type { Capabilities, ProviderAdapter, RunOptions, RunResult } from '../../types/provider.js';
import type { CostEstimate, Usage } from '../../types/usage.js';

export interface DirectApiAdapterOptions {
  /** Vendor key — 'anthropic' or 'openai'. */
  vendor: 'anthropic' | 'openai';
  /** Resolved API key (caller verifies presence; adapter just uses it). */
  apiKey: string;
  /** Default model when RunOptions doesn't override. */
  defaultModel: string;
}

export class DirectApiAdapter implements ProviderAdapter {
  readonly name: string;
  readonly capabilities: Capabilities;

  constructor(private readonly opts: DirectApiAdapterOptions) {
    this.name = `direct-api:${opts.vendor}`;
    // Capabilities is a tag list (see provider-adapters.md). Direct-API
    // mode advertises the same tags as the CLI providers since it
    // speaks the same vendor APIs underneath.
    this.capabilities = ['streaming', 'custom-tools', 'file-edit', 'web'];
  }

  async run(_options: RunOptions): Promise<RunResult> {
    throw new Error(
      `direct-api adapter is a Phase 9 stub. Set BEAVER_PROVIDER_MODE=cli ` +
        `to use the working CLI provider, or wait for the @beaver-ai/direct-api ` +
        `extension that wires the actual ${this.opts.vendor} SDK call.`,
    );
  }

  cost(usage: Usage): CostEstimate {
    // No rate-table lookup in the stub; orchestrator already tracks
    // usage via the rate_table in CLI mode and will call the same path
    // here once the SDK extension lands. For the stub, return zero so
    // accidental invocation doesn't poison the budget guard.
    return {
      usd: 0,
      tokensIn: usage.tokensIn,
      tokensOut: usage.tokensOut,
      ...(usage.cachedInputTokens !== undefined && {
        cachedInputTokens: usage.cachedInputTokens,
      }),
    };
  }
}
