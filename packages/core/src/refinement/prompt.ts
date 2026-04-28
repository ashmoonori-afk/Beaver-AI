// Prompt template that turns the user's raw goal into a structured
// RefinementResult JSON. The LLM is instructed to output ONLY a JSON
// object matching the documented schema; the caller then parses +
// validates it via zod.
//
// Ralph-inspired: lettered-option clarifying questions + PRD with user
// stories + MVP subset.

import type { RefinerInput } from '../orchestrator/refiner.js';

const SYSTEM = `You are Beaver's planner agent. Your job is to read a user's
free-text project goal and produce a structured Product Requirements Document
(PRD) plus a Minimum Viable Product (MVP) subset that the implementation
agents (coder, reviewer, tester) will use as their north star.

OUTPUT CONTRACT — non-negotiable:

You MUST emit exactly one JSON object on stdout, with no markdown fences,
no commentary before or after. The object must match this TypeScript type:

  type Output = {
    enrichedGoal: string;          // your interpretation of the goal, expanded
    assumptions: string[];          // implicit assumptions you made
    questions: string[];            // free-form follow-ups (rarely used)
    clarifyingQuestions?: Array<{   // multi-choice questions for the user
      id: string;                   // "Q1", "Q2", ...
      text: string;
      options: Array<{ label: string; value: string }>;
    }>;
    prd?: {
      overview: string;
      goals: string[];
      userStories: Array<{
        id: string;                 // "US-001", "US-002", ...
        title: string;
        description: string;        // "As a <user>, I want <feature> so that <benefit>"
        acceptanceCriteria: string[];
      }>;
      nonGoals: string[];
      successMetrics: string[];
    };
    mvp?: {
      pitch: string;                // one-sentence elevator pitch
      features: string[];
      deferred: string[];
      scope: string;                // e.g. "~3 days · single-user · no auth"
    };
    ready: boolean;                 // true → auto-advance, no user review
  };

RULES:
- Set ready=true ONLY when the goal is unambiguous and you have NO
  clarifying questions. When ready=true, prd and mvp may be omitted (the
  enriched goal is enough).
- When ready=false, you MUST include both prd and mvp so the user has
  something concrete to review.
- Limit clarifyingQuestions to 3 or fewer, with 2-4 options each.
- userStories should be small enough that a single coder agent can
  implement one in <30 min. Aim for 2-5 stories per PRD.
- nonGoals must be explicit (e.g. "no multi-device sync", not vague).
- Output ONLY the JSON object. No prose, no fences, nothing else.`;

export interface BuildRefinementPromptInput extends RefinerInput {
  /** Iteration number for context (helps the LLM understand it's revising). */
  iteration: number;
}

export function buildRefinementPrompt(input: BuildRefinementPromptInput): {
  systemPrompt: string;
  userPrompt: string;
} {
  const lines: string[] = [];
  lines.push(`USER GOAL: ${input.rawGoal}`);
  lines.push('');
  if (input.priorResponse) {
    lines.push(`PRIOR USER RESPONSE: ${input.priorResponse}`);
  }
  if (input.sectionEdits && Object.keys(input.sectionEdits).length > 0) {
    lines.push('SECTION EDITS REQUESTED:');
    for (const [section, hint] of Object.entries(input.sectionEdits)) {
      lines.push(`  - [${section}] ${hint}`);
    }
    lines.push('');
    lines.push(
      'Apply the section edits to your previous draft. Keep all other ' +
        'sections stable unless the edit explicitly contradicts them.',
    );
  }
  if (input.iteration > 0) {
    lines.push('');
    lines.push(
      `(This is refinement iteration ${input.iteration}. The user has reviewed ` +
        'a prior draft and asked for changes. Keep your output structurally ' +
        'similar — only change what the user asked for.)',
    );
  }
  return { systemPrompt: SYSTEM, userPrompt: lines.join('\n') };
}
