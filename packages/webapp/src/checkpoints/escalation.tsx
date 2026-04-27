// `escalation` — generic blocker the orchestrator couldn't classify.
// Free-form response.

import { FreeFormActions } from './actions.js';
import type { CheckpointBodyProps, CheckpointEntry } from './types.js';

function EscalationBody({ checkpoint }: CheckpointBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-text-500">Escalation</span>
      <p className="text-body text-text-50 whitespace-pre-wrap">{checkpoint.prompt}</p>
    </div>
  );
}

export const escalation: CheckpointEntry = {
  Body: EscalationBody,
  Actions: FreeFormActions,
};
