// satisfiedCheck — FINAL_REVIEW_PENDING sub-decision. Asks whether the run
// truly satisfies the goal before posting the human final-review checkpoint.

import { z } from 'zod';

import type { ProviderAdapter } from '../../types/provider.js';

import { runDecision } from './runner.js';

export const SatisfiedCheckOutputSchema = z.object({
  satisfied: z.boolean(),
  gaps: z.array(z.string()),
});
export type SatisfiedCheckOutput = z.infer<typeof SatisfiedCheckOutputSchema>;

export interface PlanOutputEntry {
  taskId: string;
  summary: string;
}

export interface SatisfiedCheckInput {
  adapter: ProviderAdapter;
  goal: string;
  planOutputs: PlanOutputEntry[];
  workdir?: string;
}

export async function satisfiedCheck(input: SatisfiedCheckInput): Promise<SatisfiedCheckOutput> {
  return runDecision<SatisfiedCheckOutput>({
    decisionName: 'satisfiedCheck',
    promptName: 'satisfiedCheck',
    schema: SatisfiedCheckOutputSchema,
    adapter: input.adapter,
    ...(input.workdir !== undefined ? { workdir: input.workdir } : {}),
    substitutions: {
      goal: input.goal,
      planOutputs: input.planOutputs.map((p) => `- ${p.taskId}: ${p.summary}`).join('\n'),
    },
  });
}
