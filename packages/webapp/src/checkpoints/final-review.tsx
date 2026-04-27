// `final-review` — orchestrator reached FINAL_REVIEW_PENDING and asks the
// human to ship or discard. Approve-style action shape; the bigger
// branch-list / diff-stat hero card lands in W.5 (4U.4).

import { ApproveActions } from './actions.js';
import type { CheckpointBodyProps, CheckpointEntry } from './types.js';

function FinalReviewBody({ checkpoint }: CheckpointBodyProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-text-500">Final review</span>
      <p className="text-body text-text-50 whitespace-pre-wrap">{checkpoint.prompt}</p>
    </div>
  );
}

export const finalReview: CheckpointEntry = {
  Body: FinalReviewBody,
  Actions: ApproveActions,
};
