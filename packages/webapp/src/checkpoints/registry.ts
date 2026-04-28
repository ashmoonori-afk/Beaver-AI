// kind -> { Body, Actions } lookup. CheckpointCard uses this once;
// no `if (kind === 'X')` cascades anywhere in the renderer per the
// 4U.3 spaghetti rule.

import { budgetExceeded } from './budget-exceeded.js';
import { escalation } from './escalation.js';
import { finalReview } from './final-review.js';
import { goalClarification } from './goal-clarification.js';
import { goalRefinement } from './goal-refinement.js';
import { mergeConflict } from './merge-conflict.js';
import { planApproval } from './plan-approval.js';
import { riskyChangeConfirmation } from './risky-change-confirmation.js';
import type { CheckpointRegistry } from './types.js';

export const CHECKPOINT_REGISTRY: CheckpointRegistry = {
  'goal-clarification': goalClarification,
  'goal-refinement': goalRefinement,
  'plan-approval': planApproval,
  'risky-change-confirmation': riskyChangeConfirmation,
  'merge-conflict': mergeConflict,
  escalation: escalation,
  'final-review': finalReview,
  'budget-exceeded': budgetExceeded,
};
