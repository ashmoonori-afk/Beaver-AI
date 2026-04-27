// `risky-change-confirmation` — sandbox/policy hook escalated a write.
// Body framed with a "Risky change" header to flag urgency. Approve-style.

import { ApproveActions } from './actions.js';
import type { CheckpointBodyProps, CheckpointEntry } from './types.js';

function RiskyChangeBody({ checkpoint }: CheckpointBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-danger-500">Risky change — confirm</span>
      <p className="text-body text-text-50 whitespace-pre-wrap">{checkpoint.prompt}</p>
    </div>
  );
}

export const riskyChangeConfirmation: CheckpointEntry = {
  Body: RiskyChangeBody,
  Actions: ApproveActions,
};
