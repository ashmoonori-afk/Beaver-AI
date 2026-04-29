// Reviewer prompt — feeds the task contract + the agent's RunResult
// and asks for one of three verdicts: `accept`, `retry`, `escalate`.
//
// Bias: encourage `accept` when acceptance criteria look met; `retry`
// when the failure is mechanical and a re-run might fix it (flaky
// tool, transient API error, agent confused itself); `escalate` when
// the work needs a human (ambiguous intent, irreversible operation,
// outside of the planner's scope).

import type { Task } from '../plan/schema.js';
import type { RunResult } from '../types/provider.js';

export const REVIEWER_VERDICTS = ['accept', 'retry', 'escalate'] as const;
export type ReviewerVerdict = (typeof REVIEWER_VERDICTS)[number];

const SYSTEM = `You are Beaver's reviewer. A coder agent just produced
a result for one task in a plan. Your job is to decide whether the
output meets the task's acceptance criteria and respond with exactly
one of three verdicts:

  accept   — the task is complete; the run should advance.
  retry    — the failure is mechanical/transient (flaky tool, network
             blip, agent confused mid-step); re-running the same task
             is likely to succeed.
  escalate — the work cannot be safely auto-completed; a human must
             decide (irreversible operation, ambiguous intent,
             scope expansion not authorized by the plan).

Output rules:
- ALWAYS reply with a single JSON object: { "verdict": "...",
  "reason": "..." } and nothing else. No prose, no fences.
- "reason" is one short sentence (≤ 200 chars) the user reads in the
  audit log.
- Default to 'accept' when acceptance criteria look met. Be skeptical
  about partial completions — those are 'retry' or 'escalate'.
- 'escalate' should be rare; reserve for things only a human can
  decide.`;

export interface BuildReviewerPromptInput {
  task: Task;
  result: RunResult;
}

export function buildReviewerPrompt(input: BuildReviewerPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const lines: string[] = [];
  lines.push(`TASK ID: ${input.task.id}`);
  lines.push(`TASK ROLE: ${input.task.role}`);
  lines.push(`TASK GOAL: ${input.task.goal}`);
  lines.push('');
  lines.push('ACCEPTANCE CRITERIA:');
  for (const c of input.task.acceptanceCriteria) {
    lines.push(`  - ${c}`);
  }
  lines.push('');
  lines.push(`RESULT STATUS: ${input.result.status}`);
  lines.push(`RESULT SUMMARY: ${input.result.summary}`);
  if (input.result.artifacts.length > 0) {
    lines.push('ARTIFACTS:');
    for (const a of input.result.artifacts) {
      lines.push(`  - ${a.kind} ${a.path}${a.summary ? ` — ${a.summary}` : ''}`);
    }
  }
  lines.push('');
  lines.push(
    'Decide now. Emit one JSON object: { "verdict": "accept" | "retry" | "escalate", "reason": "..." }',
  );
  return { systemPrompt: SYSTEM, userPrompt: lines.join('\n') };
}
