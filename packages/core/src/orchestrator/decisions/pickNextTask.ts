// pickNextTask — EXECUTING sub-decision. Picks the next ready task and
// returns its id, the provider to dispatch with, and the role name.

import { z } from 'zod';

import { PlanSchema, type Plan } from '../../plan/schema.js';
import type { ProviderAdapter } from '../../types/provider.js';

import { runDecision } from './runner.js';

export const PickNextTaskOutputSchema = z.object({
  taskId: z.string().min(1),
  providerName: z.string().min(1),
  roleName: z.string().min(1),
});
export type PickNextTaskOutput = z.infer<typeof PickNextTaskOutputSchema>;

export interface PickNextTaskInput {
  adapter: ProviderAdapter;
  plan: Plan;
  completedIds: string[];
  workdir?: string;
}

export async function pickNextTask(input: PickNextTaskInput): Promise<PickNextTaskOutput> {
  // Validate the plan up-front so a malformed plan fails loudly rather than
  // surfacing as a sub-decision validation error downstream.
  PlanSchema.parse(input.plan);
  return runDecision<PickNextTaskOutput>({
    decisionName: 'pickNextTask',
    promptName: 'pickNextTask',
    schema: PickNextTaskOutputSchema,
    adapter: input.adapter,
    ...(input.workdir !== undefined ? { workdir: input.workdir } : {}),
    substitutions: {
      plan: JSON.stringify(input.plan, null, 2),
      completedIds: JSON.stringify(input.completedIds),
    },
  });
}
