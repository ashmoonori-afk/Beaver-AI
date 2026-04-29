// Real LLM-backed reviewer.
//
// Phase 1-A — was a stub returning `accept` for everything. The new
// reviewer calls a ProviderAdapter with the task contract + agent
// result, parses one of three verdicts, and returns. Parse failures
// fall through to `accept` (fail-open) to avoid stalling the run on
// reviewer hiccups; the orchestrator's audit log records the parse
// error so a misbehaving reviewer is investigable.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { extractJsonObject } from '../refinement/parse.js';
import type { Task } from '../plan/schema.js';
import type { ProviderAdapter, RunOptions, RunResult } from '../types/provider.js';

import { buildReviewerPrompt, REVIEWER_VERDICTS, type ReviewerVerdict } from './prompt.js';

export type Reviewer = (
  taskId: string,
  result: RunResult,
) => Promise<{ verdict: ReviewerVerdict; reason: string }>;

export interface MakeLlmReviewerOptions {
  adapter: ProviderAdapter;
  /** Maps taskId → Task so the prompt builder has acceptance criteria.
   *  v0.1: orchestrator passes the plan in via this dictionary at run
   *  start (a single-flight reviewer reuses the same map across tasks). */
  tasksById: Map<string, Task>;
  workdir?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 90_000;

export function makeLlmReviewer(opts: MakeLlmReviewerOptions): Reviewer {
  const workdir = opts.workdir ?? path.join(os.tmpdir(), 'beaver-reviewer');
  fs.mkdirSync(workdir, { recursive: true });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (taskId, result) => {
    const task = opts.tasksById.get(taskId);
    if (!task) {
      // Reviewer can't reason without a task — accept and move on so
      // the run isn't deadlocked on a missing-context bug.
      return { verdict: 'accept', reason: `reviewer: no task in dictionary for id=${taskId}` };
    }

    const { systemPrompt, userPrompt } = buildReviewerPrompt({ task, result });
    const runOpts: RunOptions = {
      prompt: userPrompt,
      workdir,
      systemPrompt,
      timeoutMs,
    };

    let raw: string | undefined;
    try {
      const adapterResult = await opts.adapter.run(runOpts);
      raw = adapterResult.finalAssistantMessage ?? adapterResult.summary;
    } catch (err) {
      return {
        verdict: 'accept',
        reason: `reviewer adapter failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (!raw) {
      return { verdict: 'accept', reason: 'reviewer adapter returned no message' };
    }

    const json = extractJsonObject(raw);
    if (!json) {
      return { verdict: 'accept', reason: 'reviewer output had no JSON object' };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      return {
        verdict: 'accept',
        reason: `reviewer JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return { verdict: 'accept', reason: 'reviewer output was not a JSON object' };
    }
    const obj = parsed as Record<string, unknown>;
    const verdict = obj['verdict'];
    const reason = typeof obj['reason'] === 'string' ? (obj['reason'] as string) : '';
    if (typeof verdict !== 'string' || !REVIEWER_VERDICTS.includes(verdict as ReviewerVerdict)) {
      return {
        verdict: 'accept',
        reason: `reviewer returned unrecognised verdict '${String(verdict)}'`,
      };
    }
    return { verdict: verdict as ReviewerVerdict, reason: reason.slice(0, 240) };
  };
}
