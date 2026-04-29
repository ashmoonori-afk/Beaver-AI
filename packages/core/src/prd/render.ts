// RefinementResult → markdown PRD renderer.
//
// v0.2 M1.2. Per the iter-1 user decision (docs/v0.2-progress.md), the
// existing v0.1 `LlmRefiner` output is the v0.2 PRD source. This module
// renders the structured `RefinementResult` as the 8-section markdown
// shape that `prompts/prd-author.md` promises and `validate.ts` enforces.
// Pure function, no I/O — the orchestrator owns persistence.

import type { PRD, RefinementResult } from '../orchestrator/refiner.js';

const MAX_ACCEPTANCE_ITEMS = 7;
const MIN_ACCEPTANCE_ITEMS = 1; // validatePrd requires ≥ 1; 3-7 is the prompt ideal.

/** Render a `RefinementResult` as the 8-section markdown PRD that
 *  `validatePrd` accepts. Always returns a complete document so the
 *  orchestrator can save it to `<workspace>/.beaver/prd.md` directly. */
export function renderRefinementAsMarkdown(
  refinement: RefinementResult,
  rawGoal: string,
): string {
  const summary = buildSummary(refinement);
  const background = buildBackground(refinement, rawGoal);
  const users = buildUsers(refinement);
  const goals = buildGoals(refinement);
  const nonGoals = buildNonGoals(refinement);
  const solution = buildSolution(refinement);
  const acceptance = buildAcceptance(refinement);
  const risks = buildRisks(refinement);

  return [
    `## Summary\n${summary}`,
    `## Background\n${background}`,
    `## Users\n${users}`,
    `## Goals\n${goals}`,
    `## Non-goals\n${nonGoals}`,
    `## Solution sketch\n${solution}`,
    `## Acceptance\n${acceptance}`,
    `## Risks\n${risks}`,
  ].join('\n\n').trim() + '\n';
}

/** Two-to-four sentence summary. Prefer the PRD overview when the
 *  refiner produced one; fall back to the MVP pitch and finally the
 *  enriched goal so a partial refinement still renders. */
function buildSummary(r: RefinementResult): string {
  if (r.prd?.overview) return r.prd.overview.trim();
  if (r.mvp?.pitch) return r.mvp.pitch.trim();
  return r.enrichedGoal.trim();
}

/** Cite the user's verbatim goal so the reader sees what was actually
 *  asked, then add 1-2 short context lines from the refinement. */
function buildBackground(r: RefinementResult, rawGoal: string): string {
  const lines = [`The user said: "${rawGoal.trim()}".`];
  if (r.enrichedGoal.trim() !== rawGoal.trim()) {
    lines.push(`Refined intent: ${r.enrichedGoal.trim()}`);
  }
  return lines.join(' ');
}

/** Bullet list of users. RefinementResult does not model users
 *  explicitly; derive from the user-story descriptions when present,
 *  else fall back to a generic single-user line so the section always
 *  has at least one bullet. */
function buildUsers(r: RefinementResult): string {
  const stories = r.prd?.userStories ?? [];
  const users = new Set<string>();
  for (const story of stories) {
    const role = extractUserRole(story.description);
    if (role) users.add(role);
  }
  if (users.size > 0) {
    return Array.from(users)
      .slice(0, 3)
      .map((u) => `- ${capitalizeFirst(u)}.`)
      .join('\n');
  }
  return '- The end user described in the goal above.';
}

/** "As a <role>, I want ..." → returns "<role>". Loose match — the
 *  prompt does not enforce the format, so we accept lowercase, missing
 *  comma, etc. Returns null when the description doesn't open with one. */
function extractUserRole(description: string): string | null {
  const match = description.trim().match(/^as\s+an?\s+([^,]+?)(?:[,.]|$|\s+I\s+)/i);
  return match?.[1]?.trim() ?? null;
}

function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** 3-5 measurable goals. PRD.goals is the canonical source. When it's
 *  empty (refiner not yet structured), synthesize a single goal from
 *  the enriched goal so the section always has at least one bullet. */
function buildGoals(r: RefinementResult): string {
  const source = r.prd?.goals ?? [];
  if (source.length === 0) {
    return `- ${r.enrichedGoal.trim()}.`;
  }
  return source.slice(0, 5).map((g) => `- ${g.trim()}`).join('\n');
}

function buildNonGoals(r: RefinementResult): string {
  const source = r.prd?.nonGoals ?? [];
  if (source.length === 0) {
    return '- Out-of-scope items will be deferred to a follow-up run.';
  }
  return source.slice(0, 3).map((n) => `- ${n.trim()}`).join('\n');
}

/** Solution sketch — concrete files / endpoints / fields. We don't
 *  have those in `RefinementResult`, so we surface the MVP feature
 *  list which is the closest thing the refiner produces. */
function buildSolution(r: RefinementResult): string {
  const features = r.mvp?.features ?? [];
  if (features.length === 0) {
    return '- Implementation details will be derived from the acceptance items below.';
  }
  return features.slice(0, 8).map((f) => `- ${f.trim()}`).join('\n');
}

/** Flatten user-story acceptance criteria into `- [ ] …` items. The
 *  prompt asks for 3-7 items; if the refiner produced more, truncate
 *  to keep the checklist readable. If the refiner produced none, fall
 *  back to a single "satisfy the goal" item so `validatePrd` passes. */
function buildAcceptance(r: RefinementResult): string {
  const items: string[] = [];
  for (const story of r.prd?.userStories ?? []) {
    for (const criterion of story.acceptanceCriteria) {
      items.push(formatAcceptanceItem(criterion, story));
      if (items.length >= MAX_ACCEPTANCE_ITEMS) break;
    }
    if (items.length >= MAX_ACCEPTANCE_ITEMS) break;
  }
  if (items.length < MIN_ACCEPTANCE_ITEMS) {
    items.push('Satisfy the goal text above end-to-end.');
  }
  return items.map((i) => `- [ ] ${i}`).join('\n');
}

/** Make a raw acceptance criterion read like an imperative sentence
 *  ending in a period. Trims whitespace, strips a leading checkbox if
 *  the LLM already added one, and capitalises the first letter. */
function formatAcceptanceItem(raw: string, _story: { id: string; title: string }): string {
  let text = raw.trim();
  text = text.replace(/^-?\s*\[[ xX]\]\s*/, '');
  if (text.length === 0) return 'Satisfy the related user story.';
  text = capitalizeFirst(text);
  if (!/[.?!]$/.test(text)) text += '.';
  return text;
}

/** Risks pull from the refiner's `assumptions` (most-likely things to
 *  break) and `questions` (open uncertainties). Always emits at least
 *  one bullet so `validatePrd` accepts the section. */
function buildRisks(r: RefinementResult): string {
  const lines: string[] = [];
  for (const a of (r.assumptions ?? []).slice(0, 2)) {
    lines.push(`- Assumption may be wrong: ${a.trim()}.`);
  }
  for (const q of (r.questions ?? []).slice(0, 1)) {
    lines.push(`- Open question: ${q.trim()}.`);
  }
  if (lines.length === 0) {
    lines.push('- The goal text leaves implementation details to the coder; misinterpretation is the main risk.');
  }
  return lines.join('\n');
}

// Re-exported for callers that want the canonical narrow shape.
export type { RefinementResult, PRD };
