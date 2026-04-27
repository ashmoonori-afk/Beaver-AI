// `goal-clarification` — agent stuck on ambiguous goal. Free-form response.

import { FreeFormActions } from './actions.js';
import type { CheckpointBodyProps, CheckpointEntry } from './types.js';

function GoalClarificationBody({ checkpoint }: CheckpointBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-text-500">Goal clarification</span>
      <p className="text-body text-text-50 whitespace-pre-wrap">{checkpoint.prompt}</p>
    </div>
  );
}

export const goalClarification: CheckpointEntry = {
  Body: GoalClarificationBody,
  Actions: FreeFormActions,
};
