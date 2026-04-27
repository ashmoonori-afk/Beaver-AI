// Sub-decisions registry. Flat map name -> async function (per phase-2
// spaghetti rule: no nested logic, no general "askLLM" abstraction).

import { pickNextTask } from './pickNextTask.js';
import { refinePlan } from './refinePlan.js';
import { reviewVerdict } from './reviewVerdict.js';
import { satisfiedCheck } from './satisfiedCheck.js';

export const decisions = {
  refinePlan,
  pickNextTask,
  reviewVerdict,
  satisfiedCheck,
} as const;

export type DecisionName = keyof typeof decisions;

export { refinePlan } from './refinePlan.js';
export { pickNextTask, PickNextTaskOutputSchema } from './pickNextTask.js';
export type { PickNextTaskOutput } from './pickNextTask.js';
export { reviewVerdict, ReviewVerdictOutputSchema } from './reviewVerdict.js';
export type { ReviewVerdictOutput } from './reviewVerdict.js';
export { satisfiedCheck, SatisfiedCheckOutputSchema } from './satisfiedCheck.js';
export type { SatisfiedCheckOutput, PlanOutputEntry } from './satisfiedCheck.js';
export { SubDecisionValidationError } from './runner.js';
