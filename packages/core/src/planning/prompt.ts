// Plan-generation prompt — the LLM reads the approved PRD/MVP and
// emits a JSON Plan (matches PlanSchema) that the orchestrator
// dispatches.

import type { Plan } from '../plan/schema.js';
import type { RefinementResult } from '../orchestrator/refiner.js';

const SYSTEM = `You are Beaver's planner. Given a Product Requirements
Document (PRD) plus the user's enriched goal, produce a JSON Plan that
the implementation agents (coder, reviewer, tester) will execute.

OUTPUT CONTRACT — non-negotiable:

You MUST emit exactly one JSON object on stdout. No markdown fences,
no commentary, no preamble. The object must validate against this
TypeScript shape:

  type Plan = {
    version: 1;                       // start at 1; orchestrator bumps later
    goal: string;                     // copy of the enriched goal
    tasks: Array<{
      id: string;                     // kebab-case, [a-z0-9-]+
      role: "planner" | "coder" | "reviewer" | "tester" | "integrator" | "summarizer";
      goal: string;                   // one-sentence goal for this task
      prompt: string;                 // full instructions for the agent
      dependsOn: string[];            // task ids that must finish first
      acceptanceCriteria: string[];   // verifiable "done" signals
      capabilitiesNeeded: string[];   // tags from { "file-edit", "web", "sandbox", "streaming", "custom-tools" }
      providerHint?: "claude-code" | "codex";  // optional; orchestrator picks per role-default if omitted
      budgetUsd?: number;             // optional per-task cap
    }>;
    createdAt: string;                // ISO-8601, current time
  };

RULES:
- Map PRD user stories to plan tasks roughly 1:1. Each task should be
  small enough that one coder agent finishes it in <30 min.
- Use 'coder' for implementation tasks; 'reviewer' for read-only
  verification; 'tester' for adding/running tests.
- dependsOn must be acyclic. Do NOT depend on tasks that don't exist
  in this plan.
- acceptanceCriteria are concrete (passes test X, file Y exists with
  Z content), not vague ("looks good").
- If the PRD is empty (refiner had ready=true with no PRD), default
  to one 'coder' task whose prompt is the enriched goal verbatim.
- Output ONLY the JSON. No prose, no fences.`;

export interface BuildPlannerPromptInput {
  rawGoal: string;
  enrichedGoal: string;
  refinement?: RefinementResult;
}

export function buildPlannerPrompt(input: BuildPlannerPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const lines: string[] = [];
  lines.push(`USER GOAL: ${input.rawGoal}`);
  lines.push(`ENRICHED GOAL: ${input.enrichedGoal}`);
  lines.push('');
  if (input.refinement?.prd) {
    lines.push('PRD:');
    lines.push(JSON.stringify(input.refinement.prd, null, 2));
    lines.push('');
  }
  if (input.refinement?.mvp) {
    lines.push('MVP:');
    lines.push(JSON.stringify(input.refinement.mvp, null, 2));
    lines.push('');
  }
  if (input.refinement?.assumptions && input.refinement.assumptions.length > 0) {
    lines.push('Assumptions accepted by the user:');
    for (const a of input.refinement.assumptions) lines.push(`  - ${a}`);
    lines.push('');
  }
  lines.push(
    'Produce the Plan now. Emit exactly one JSON object matching the schema. ' + 'No commentary.',
  );
  return { systemPrompt: SYSTEM, userPrompt: lines.join('\n') };
}

/** Stable identity helper — used by tests to verify the prompt
 *  references the PRD/MVP shape correctly without re-reading the
 *  template each time. */
export function planContainsKey(plan: Plan, taskId: string): boolean {
  return plan.tasks.some((t) => t.id === taskId);
}
