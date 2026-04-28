// Real Refiner — calls a ProviderAdapter (Claude Code CLI or Codex)
// with a refinement prompt + parses the JSON output.
//
// W.12 — replaces the in-test mock refiner used in W.11. The orchestrator
// loop accepts a `Refiner` callback; this factory wraps any
// ProviderAdapter (defaulting to ClaudeCodeAdapter) into one.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { ProviderAdapter, RunOptions } from '../types/provider.js';
import type { Refiner, RefinementResult } from '../orchestrator/refiner.js';

import { parseRefinementJson } from './parse.js';
import { buildRefinementPrompt } from './prompt.js';

export interface MakeLlmRefinerOptions {
  adapter: ProviderAdapter;
  /** Working directory for the adapter run. Defaults to a tmp dir;
   *  refinement is read-only so any writable dir works. */
  workdir?: string;
  /** Per-call timeout. Defaults to 180 s — the planner LLM is patient. */
  timeoutMs?: number;
  /** Soft retry cap on parse failures. The LLM occasionally emits
   *  malformed JSON; we re-prompt with a "your last output didn't parse"
   *  hint. Default 1 retry. */
  maxParseRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_PARSE_RETRIES = 1;

/** Build a Refiner that delegates to a real LLM via the supplied adapter. */
export function makeLlmRefiner(opts: MakeLlmRefinerOptions): Refiner {
  const workdir = opts.workdir ?? path.join(os.tmpdir(), 'beaver-refiner');
  fs.mkdirSync(workdir, { recursive: true });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxParseRetries ?? DEFAULT_MAX_PARSE_RETRIES;

  return async (input) => {
    const iteration = 0; // outer iteration is in the orchestrator loop
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const { systemPrompt, userPrompt } = buildRefinementPrompt({ ...input, iteration });
      const finalUser =
        lastError !== null
          ? `${userPrompt}\n\n(Your previous output failed to parse: ${lastError}. Emit ONLY a single JSON object.)`
          : userPrompt;
      const runOpts: RunOptions = {
        prompt: finalUser,
        workdir,
        systemPrompt,
        timeoutMs,
      };
      const result = await opts.adapter.run(runOpts);

      const message = result.finalAssistantMessage ?? result.summary;
      if (!message) {
        lastError = 'adapter returned no assistant message';
        continue;
      }
      const parsed = parseRefinementJson(message);
      if (parsed.ok) {
        return parsed.result;
      }
      lastError = parsed.reason;
    }

    // Final fallback — produce a degenerate "ready" result so the
    // orchestrator can at least proceed to PLANNING with the raw goal.
    // The audit log records that refinement degraded.
    const fallback: RefinementResult = {
      enrichedGoal: input.rawGoal,
      assumptions: ['refinement failed; using raw goal verbatim'],
      questions: [],
      ready: true,
    };
    return fallback;
  };
}
