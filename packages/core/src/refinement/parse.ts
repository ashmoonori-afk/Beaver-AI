// Strict zod parse of the LLM's refinement output.
//
// The LLM is instructed (via prompt.ts) to emit a single JSON object.
// Reality: it sometimes wraps it in markdown fences, prepends "Here's
// the JSON:", or trails a sentence. extractJsonObject strips that
// preamble before zod.parse runs.

import { z } from 'zod';

import type { RefinementResult } from '../orchestrator/refiner.js';

const ClarifyingOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

const ClarifyingQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(ClarifyingOptionSchema).min(1),
});

const UserStorySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)),
});

const PRDSchema = z.object({
  overview: z.string().min(1),
  goals: z.array(z.string().min(1)),
  userStories: z.array(UserStorySchema),
  nonGoals: z.array(z.string().min(1)),
  successMetrics: z.array(z.string().min(1)),
});

const MVPSchema = z.object({
  pitch: z.string().min(1),
  features: z.array(z.string().min(1)),
  deferred: z.array(z.string().min(1)),
  scope: z.string().min(1),
});

export const RefinementOutputSchema = z.object({
  enrichedGoal: z.string().min(1),
  assumptions: z.array(z.string().min(1)).default([]),
  questions: z.array(z.string().min(1)).default([]),
  clarifyingQuestions: z.array(ClarifyingQuestionSchema).optional(),
  prd: PRDSchema.optional(),
  mvp: MVPSchema.optional(),
  ready: z.boolean(),
});

/** Pull the first balanced JSON object out of a string that may contain
 *  fences (```json … ```), preamble ("Here's the spec:"), or trailing
 *  prose. Returns the JSON substring or null. */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  // Common case: pure JSON.
  if (trimmed.startsWith('{')) {
    return balancedSubstring(trimmed);
  }
  // Fenced markdown: ```json\n{...}\n```
  // review-pass v0.1: noUncheckedIndexedAccess makes `fence[1]` `string |
  // undefined`. Guard explicitly rather than non-null asserting.
  const fence = trimmed.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  const fenceBody = fence?.[1];
  if (fenceBody !== undefined) return balancedSubstring(fenceBody.trim());
  // Embedded: find first '{' and try to balance.
  const idx = trimmed.indexOf('{');
  if (idx >= 0) return balancedSubstring(trimmed.slice(idx));
  return null;
}

function balancedSubstring(s: string): string | null {
  // Walk forward counting braces, ignoring those inside string literals.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return null;
}

export interface ParseRefinementOutput {
  ok: true;
  result: RefinementResult;
}

export interface ParseRefinementError {
  ok: false;
  reason: string;
}

/** Parse + validate the LLM's stdout into a RefinementResult. Returns
 *  a structured result so callers (CLI, orchestrator) can decide how
 *  to surface failures (retry, escalate, fallback). */
export function parseRefinementJson(text: string): ParseRefinementOutput | ParseRefinementError {
  const json = extractJsonObject(text);
  if (!json) return { ok: false, reason: 'no JSON object found in LLM output' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return {
      ok: false,
      reason: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const validated = RefinementOutputSchema.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, reason: `schema validation failed: ${validated.error.message}` };
  }
  return { ok: true, result: validated.data };
}
