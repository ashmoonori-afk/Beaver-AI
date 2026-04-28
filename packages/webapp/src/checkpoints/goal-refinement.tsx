// `goal-refinement` checkpoint — planner has read the user's raw goal and
// drafted an enriched version, optionally with clarifying questions.
// User approves / comments / rejects via the standard ApproveActions
// shape (matching plan-approval semantics).
//
// Body shows a 2-column diff (raw vs enriched) + assumption list +
// any clarifying questions.

import { ApproveActions } from './actions.js';
import type { CheckpointBodyProps, CheckpointEntry } from './types.js';

function GoalRefinementBody({ checkpoint }: CheckpointBodyProps) {
  const r = checkpoint.refinement;
  if (!r) {
    // Falls back to the prompt if the structured payload is missing —
    // older transports / pre-7.2 fixtures end up here.
    return (
      <div className="flex flex-col gap-2">
        <span className="text-caption text-text-500">Goal refinement</span>
        <p className="text-body text-text-50 whitespace-pre-wrap">{checkpoint.prompt}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <span className="text-caption text-text-500">Goal refinement</span>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <GoalColumn label="Your goal" body={r.rawGoal} dimmed />
        <GoalColumn label="Beaver's read" body={r.enrichedGoal} highlight />
      </div>
      {r.assumptions.length > 0 ? (
        <div data-testid="refinement-assumptions" className="flex flex-col gap-1">
          <span className="text-caption text-text-500">Assumptions</span>
          <ul className="list-disc pl-5 text-body text-text-300">
            {r.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {r.questions.length > 0 ? (
        <div data-testid="refinement-questions" className="flex flex-col gap-1">
          <span className="text-caption text-accent-400">Questions</span>
          <ol className="list-decimal pl-5 text-body text-text-50">
            {r.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

interface GoalColumnProps {
  label: string;
  body: string;
  dimmed?: boolean;
  highlight?: boolean;
}

function GoalColumn({ label, body, dimmed, highlight }: GoalColumnProps) {
  return (
    <div
      className={
        'flex flex-col gap-1 rounded-card bg-surface-900 px-3 py-2 ' +
        (dimmed ? 'opacity-70' : '') +
        (highlight ? 'ring-1 ring-accent-700' : '')
      }
    >
      <span className="text-caption text-text-500">{label}</span>
      <p className="text-body text-text-50 whitespace-pre-wrap">{body}</p>
    </div>
  );
}

export const goalRefinement: CheckpointEntry = {
  Body: GoalRefinementBody,
  Actions: ApproveActions,
};
