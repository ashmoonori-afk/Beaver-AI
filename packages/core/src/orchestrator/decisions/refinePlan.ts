// refinePlan — PLANNING sub-decision. Refines the current plan in response
// to a user comment on the draft. Output is validated against PlanSchema.

import { PlanSchema, type Plan } from '../../plan/schema.js';
import type { ProviderAdapter } from '../../types/provider.js';

import { runDecision } from './runner.js';

export interface RefinePlanInput {
  adapter: ProviderAdapter;
  plan: Plan;
  userComment: string;
  goal: string;
  workdir?: string;
}

export async function refinePlan(input: RefinePlanInput): Promise<Plan> {
  return runDecision<Plan>({
    decisionName: 'refinePlan',
    promptName: 'refinePlan',
    schema: PlanSchema,
    adapter: input.adapter,
    ...(input.workdir !== undefined ? { workdir: input.workdir } : {}),
    substitutions: {
      goal: input.goal,
      currentPlan: JSON.stringify(input.plan, null, 2),
      userComment: input.userComment,
    },
  });
}
