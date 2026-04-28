// Real Planner — calls a ProviderAdapter with the PRD-driven planner
// prompt and parses the JSON Plan output.
//
// W.12.3: this is the producer that converts an approved
// RefinementResult (PRD + MVP) into a concrete Plan the orchestrator
// can dispatch. The fallback path (when parsing fails or the LLM
// returns a non-Plan) is a single-task stub built from the enriched
// goal so the run never deadlocks here either.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type Plan, PlanSchema, type Task } from '../plan/schema.js';
import { extractJsonObject } from '../refinement/parse.js';
import type { RefinementResult } from '../orchestrator/refiner.js';
import type { ProviderAdapter, RunOptions } from '../types/provider.js';

import { buildPlannerPrompt } from './prompt.js';

export interface PlannerInput {
  rawGoal: string;
  /** Approved refinement (PRD/MVP). When undefined, the planner falls
   *  back to a single-task stub. */
  refinement?: RefinementResult;
}

export type Planner = (input: PlannerInput) => Promise<Plan>;

export interface MakeLlmPlannerOptions {
  adapter: ProviderAdapter;
  workdir?: string;
  timeoutMs?: number;
  maxParseRetries?: number;
}

const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_MAX_PARSE_RETRIES = 1;

export function makeLlmPlanner(opts: MakeLlmPlannerOptions): Planner {
  const workdir = opts.workdir ?? path.join(os.tmpdir(), 'beaver-planner');
  fs.mkdirSync(workdir, { recursive: true });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxParseRetries ?? DEFAULT_MAX_PARSE_RETRIES;

  return async (input) => {
    const enrichedGoal = input.refinement?.enrichedGoal ?? input.rawGoal;
    let lastError: string | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const { systemPrompt, userPrompt } = buildPlannerPrompt({
        rawGoal: input.rawGoal,
        enrichedGoal,
        ...(input.refinement !== undefined ? { refinement: input.refinement } : {}),
      });
      const finalUser =
        lastError !== null
          ? `${userPrompt}\n\n(Your previous output failed to parse: ${lastError}. Emit ONLY a single JSON object matching the Plan schema.)`
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
        lastError = 'planner adapter returned no assistant message';
        continue;
      }
      const json = extractJsonObject(message);
      if (!json) {
        lastError = 'no JSON object found in planner output';
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch (err) {
        lastError = `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`;
        continue;
      }
      // Stamp createdAt if the LLM forgot — common omission.
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Object.prototype.hasOwnProperty.call(parsed, 'createdAt')
      ) {
        (parsed as Record<string, unknown>).createdAt = new Date().toISOString();
      }
      const validated = PlanSchema.safeParse(parsed);
      if (validated.success) return validated.data;
      lastError = `PlanSchema rejected output: ${validated.error.message}`;
    }

    // Fallback: single-task stub plan. Run never deadlocks.
    return PlanSchema.parse({
      version: 1,
      goal: enrichedGoal,
      tasks: [
        {
          id: 't1',
          role: 'coder' as const,
          goal: enrichedGoal.slice(0, 80),
          prompt:
            `Implement the user goal end-to-end: ${enrichedGoal}` +
            (lastError !== null
              ? `\n\n(Note: planner LLM output failed to parse — ${lastError}. ` +
                `Treating this as a single-task plan.)`
              : ''),
          dependsOn: [] as string[],
          acceptanceCriteria: ['the goal text is satisfied'],
          capabilitiesNeeded: [] as string[],
        } satisfies Task,
      ],
      createdAt: new Date().toISOString(),
    });
  };
}
