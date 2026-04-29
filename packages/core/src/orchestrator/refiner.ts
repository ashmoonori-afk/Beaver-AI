// Refiner — produces the structured PRD/MVP payload for the
// REFINING_GOAL FSM state (W.11).
//
// The orchestrator calls a `Refiner` callback with the user's raw goal
// (and any prior user response from a checkpoint). The refiner returns
// either a "ready" result (planner is confident — auto-advance) or an
// unready one with clarifying questions / unfinished PRD that the user
// reviews via a `goal-refinement` checkpoint. Section-targeted comments
// (`comment:[prd:goals] add latency budget`) are parsed and threaded
// back into the next refiner call so the planner can patch the right
// block instead of regenerating from scratch.
//
// Shapes are intentionally duplicated with `webapp/src/types.ts` —
// the renderer can't import from core (node-only deps would bloat
// the bundle). Both sides agree on a JSON wire shape via
// `encodeRefinementPrompt` / `decodeRefinementPrompt`.

export interface ClarifyingOption {
  /** Letter label, "A" | "B" | "C" | … (Ralph "1A 2C 3B" pattern). */
  label: string;
  /** Concrete answer text the planner can act on. */
  value: string;
}

export interface ClarifyingQuestion {
  /** Stable id for routing per-question replies — typically "Q1", "Q2". */
  id: string;
  text: string;
  options: ReadonlyArray<ClarifyingOption>;
}

export interface UserStory {
  id: string;
  title: string;
  /** "As a <user>, I want <feature> so that <benefit>" sentence. */
  description: string;
  acceptanceCriteria: readonly string[];
}

export interface PRD {
  overview: string;
  goals: readonly string[];
  userStories: readonly UserStory[];
  nonGoals: readonly string[];
  successMetrics: readonly string[];
}

export interface MVP {
  pitch: string;
  features: readonly string[];
  deferred: readonly string[];
  scope: string;
}

export interface RefinementResult {
  enrichedGoal: string;
  assumptions: readonly string[];
  questions: readonly string[];
  clarifyingQuestions?: readonly ClarifyingQuestion[] | undefined;
  prd?: PRD | undefined;
  mvp?: MVP | undefined;
  /** True when the planner is confident enough to skip user review.
   *  The orchestrator auto-advances to PLANNING. False posts a
   *  `goal-refinement` checkpoint and waits for human input. */
  ready: boolean;
}

/** v0.1.1-C — context from a previous run that this run is iterating
 *  on. Lets the refiner and planner produce edits/diffs rather than
 *  re-doing work. Populated by `Beaver.run` when `req.parentRunId`
 *  resolves to a stored run; left undefined for fresh runs. */
export interface ParentRunContext {
  /** Parent run id (`r-…`). */
  runId: string;
  /** Original goal of the parent run. */
  goal: string;
  /** Final FSM state of the parent run (`COMPLETED` / `FAILED` / etc.). */
  finalState: string;
  /** JSON-stringified parent plan (or null when parent had no plan
   *  on disk yet). The refiner/planner prompt embeds this verbatim. */
  planJson: string | null;
}

export interface RefinerInput {
  rawGoal: string;
  /** Verbatim user response from the most recent goal-refinement
   *  checkpoint (`approve` / `reject` / `comment:…`). Absent on the
   *  first iteration. */
  priorResponse?: string;
  /** Section-targeted edits parsed from `comment:[prd:goals] …` style
   *  responses. Keys are `<scope>:<section>` (e.g. `prd:goals`,
   *  `mvp:features`, `Q1`). Values are the user's free-text request. */
  sectionEdits?: Record<string, string>;
  /** v0.1.1-C — parent run context for follow-up runs. */
  parentContext?: ParentRunContext;
}

export type Refiner = (input: RefinerInput) => Promise<RefinementResult>;

/** Cap on refinement iterations. Hitting this means the user keeps
 *  amending without converging — the orchestrator advances anyway with
 *  the latest result so the run doesn't deadlock. */
export const MAX_REFINEMENT_ITERATIONS = 3;

/** Wire shape for the `goal-refinement` checkpoint's `prompt` field.
 *  The checkpoint table only has a `prompt` string column; we encode
 *  the structured refinement as JSON so the renderer can deserialize
 *  without a schema migration. */
export interface RefinementPromptPayload {
  rawGoal: string;
  iteration: number;
  refinement: RefinementResult;
}

export function encodeRefinementPrompt(payload: RefinementPromptPayload): string {
  return JSON.stringify(payload);
}

export function decodeRefinementPrompt(s: string): RefinementPromptPayload | null {
  try {
    const parsed: unknown = JSON.parse(s);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.rawGoal !== 'string') return null;
    if (typeof obj.iteration !== 'number') return null;
    if (typeof obj.refinement !== 'object' || obj.refinement === null) return null;
    return parsed as RefinementPromptPayload;
  } catch {
    return null;
  }
}

// review-pass v0.1: catch *all* bracket-form edits in a single comment
// (e.g. `[prd:goals] add X [mvp:features] remove Y`), not just the first.
const SECTION_RE_GLOBAL = /\[([a-z0-9]+:[a-z0-9-]+|Q\d+)\]\s*([^[]*)/gi;

/**
 * Parse a user response into structured section edits.
 *
 * Examples:
 *   "approve"                          → {}
 *   "reject"                           → {}
 *   "comment:looks good"               → {}
 *   "comment:[prd:goals] add latency"  → { 'prd:goals': 'add latency' }
 *   "comment:Q1=B"                     → { Q1: 'B' }
 */
export function parseSectionEdits(response: string): Record<string, string> {
  if (!response.startsWith('comment:')) return {};
  const body = response.slice('comment:'.length).trim();
  // Bracket form: [scope:section] free text — catch every match.
  const out: Record<string, string> = {};
  for (const m of body.matchAll(SECTION_RE_GLOBAL)) {
    const section = m[1];
    const rest = m[2] ?? '';
    if (section) out[section] = rest.trim();
  }
  if (Object.keys(out).length > 0) return out;
  // Equals form: Q<n>=<label>
  const eqMatch = body.match(/^(Q\d+)=([A-Z])$/);
  if (eqMatch) {
    return { [eqMatch[1]!]: eqMatch[2]! };
  }
  return {};
}
