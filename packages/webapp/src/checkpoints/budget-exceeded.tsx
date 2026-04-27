// `budget-exceeded` — USD cap hit, three structured options.

import { BudgetActions } from './actions.js';
import type { CheckpointBodyProps, CheckpointEntry } from './types.js';

function BudgetExceededBody({ checkpoint }: CheckpointBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-danger-500">Budget exceeded</span>
      <p className="text-body text-text-50 whitespace-pre-wrap">{checkpoint.prompt}</p>
    </div>
  );
}

export const budgetExceeded: CheckpointEntry = {
  Body: BudgetExceededBody,
  Actions: BudgetActions,
};
