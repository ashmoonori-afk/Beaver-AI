// PRD-task reviewer. v0.2 M2.5.
//
// Calls a coder adapter as a reviewer with prompts/reviewer.md +
// the acceptance item + the latest diff, parses the strict JSON
// contract, returns a verdict.
//
// Separate from packages/core/src/review/llm-reviewer.ts on purpose:
// the existing reviewer ships an `accept | retry | escalate` verdict
// for the v0.1 plan-driven path; this one ships the simpler
// `pass | fail` contract the PRD Appendix B spec requires. v0.1
// callers see no behaviour change.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractJsonObject } from '../refinement/parse.js';
import type { ProviderAdapter, RunOptions } from '../types/provider.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = (() => {
  const dev = path.join(HERE, 'prompts');
  if (fs.existsSync(dev)) return dev;
  return path.join(HERE, 'prd-prompts');
})();
const REVIEWER_PROMPT_FILE = 'reviewer.md';

const DEFAULT_TIMEOUT_MS = 120_000;

export type PrdReviewVerdict = 'pass' | 'fail';

export interface PrdReviewResult {
  verdict: PrdReviewVerdict;
  reason: string;
  /** Present only when verdict === 'fail'. The dispatcher feeds this
   *  to the next coder attempt's prompt so the agent knows what the
   *  reviewer wanted. */
  retryHint?: string;
}

export interface PrdReviewerInput {
  /** The acceptance item the coder was supposed to satisfy. */
  acceptanceItem: string;
  /** Unified diff of the coder's edits, as text. Empty string means
   *  "no diff produced", which the reviewer should fail. */
  diff: string;
  /** Optional build / test output for the reviewer to consider. */
  buildOutput?: string;
}

export type PrdReviewer = (input: PrdReviewerInput) => Promise<PrdReviewResult>;

export interface MakePrdReviewerOptions {
  adapter: ProviderAdapter;
  workdir?: string;
  timeoutMs?: number;
}

/** Build a PrdReviewer bound to a coder adapter. The returned closure
 *  is what the dispatcher calls per task. Errors fall back to a
 *  fail verdict so a flaky reviewer never silently passes. */
export function makePrdReviewer(opts: MakePrdReviewerOptions): PrdReviewer {
  const workdir = opts.workdir ?? path.join(os.tmpdir(), 'beaver-prd-reviewer');
  fs.mkdirSync(workdir, { recursive: true });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, REVIEWER_PROMPT_FILE), 'utf8');

  return async (input) => {
    const userPrompt = buildUserPrompt(input);
    const runOpts: RunOptions = {
      prompt: userPrompt,
      workdir,
      systemPrompt,
      timeoutMs,
    };
    let message: string | undefined;
    try {
      const result = await opts.adapter.run(runOpts);
      message = result.finalAssistantMessage ?? result.summary;
    } catch (err) {
      return {
        verdict: 'fail',
        reason: 'reviewer adapter threw',
        retryHint: err instanceof Error ? err.message : String(err),
      };
    }
    return parseReviewerOutput(message ?? '');
  };
}

/** Compose the user prompt the reviewer LLM sees. Kept tiny so the
 *  reviewer focuses on the acceptance item + diff, not boilerplate. */
function buildUserPrompt(input: PrdReviewerInput): string {
  const lines = [
    `Acceptance item:\n${input.acceptanceItem}`,
    '',
    `Diff:\n${input.diff || '(no diff produced)'}`,
  ];
  if (input.buildOutput && input.buildOutput.trim().length > 0) {
    lines.push('', `Build/test output:\n${input.buildOutput}`);
  }
  lines.push('', 'Respond with the strict JSON object only.');
  return lines.join('\n');
}

/** Parse the LLM's stdout into a PrdReviewResult. Falls back to a
 *  fail verdict on any parse / shape error so the dispatcher never
 *  treats malformed output as a pass. */
export function parseReviewerOutput(text: string): PrdReviewResult {
  const json = extractJsonObject(text);
  if (!json) {
    return {
      verdict: 'fail',
      reason: 'reviewer output had no JSON object',
      retryHint: 'Re-emit the strict {verdict, reason, retry_hint?} JSON only.',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return {
      verdict: 'fail',
      reason: 'reviewer JSON.parse failed',
      retryHint: err instanceof Error ? err.message : String(err),
    };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {
      verdict: 'fail',
      reason: 'reviewer output was not a JSON object',
    };
  }
  const obj = parsed as Record<string, unknown>;
  const verdict = obj.verdict;
  const reason = obj.reason;
  if ((verdict !== 'pass' && verdict !== 'fail') || typeof reason !== 'string') {
    return {
      verdict: 'fail',
      reason: 'reviewer JSON missing required fields',
      retryHint: `expected { "verdict": "pass" | "fail", "reason": string, "retry_hint"?: string }; got ${JSON.stringify(obj)}`,
    };
  }
  const result: PrdReviewResult = { verdict, reason };
  const retryHint = obj.retry_hint ?? obj.retryHint;
  if (typeof retryHint === 'string' && retryHint.trim().length > 0) {
    result.retryHint = retryHint;
  }
  return result;
}
