// `plan-approval` checkpoint — agent posted a plan, asks for go/no-go.
// Body shows the prompt verbatim. Approve-style action shape.

import { ApproveActions } from './actions.js';
import type { CheckpointBodyProps, CheckpointEntry } from './types.js';

function PlanApprovalBody({ checkpoint }: CheckpointBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-text-500">Plan approval</span>
      <p className="text-body text-text-50 whitespace-pre-wrap">{checkpoint.prompt}</p>
    </div>
  );
}

export const planApproval: CheckpointEntry = {
  Body: PlanApprovalBody,
  Actions: ApproveActions,
};
