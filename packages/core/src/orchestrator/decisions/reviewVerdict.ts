// reviewVerdict — REVIEWING sub-decision. Returns accept / retry / escalate
// for the just-completed task output.

import { z } from 'zod';

import type { ProviderAdapter } from '../../types/provider.js';

import { runDecision } from './runner.js';

export const ReviewVerdictOutputSchema = z.object({
  verdict: z.enum(['accept', 'retry', 'escalate']),
  reason: z.string().min(1),
});
export type ReviewVerdictOutput = z.infer<typeof ReviewVerdictOutputSchema>;

export interface ReviewVerdictInput {
  adapter: ProviderAdapter;
  taskOutput: string;
  criteria: string[];
  workdir?: string;
}

export async function reviewVerdict(input: ReviewVerdictInput): Promise<ReviewVerdictOutput> {
  return runDecision<ReviewVerdictOutput>({
    decisionName: 'reviewVerdict',
    promptName: 'reviewVerdict',
    schema: ReviewVerdictOutputSchema,
    adapter: input.adapter,
    ...(input.workdir !== undefined ? { workdir: input.workdir } : {}),
    substitutions: {
      taskOutput: input.taskOutput,
      criteria: input.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n'),
    },
  });
}
