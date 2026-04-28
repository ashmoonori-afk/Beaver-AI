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
  clarifyingQuestions?: readonly ClarifyingQuestion[];
  prd?: PRD;
  mvp?: MVP;
  /** True when the planner is confident enough to skip user review.
   *  The orchestrator auto-advances to PLANNING. False posts a
   *  `goal-refinement` checkpoint and waits for human input. */
  ready: boolean;
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

const SECTION_RE = /^\[([a-z0-9]+:[a-z0-9-]+|Q\d+)\]\s*(.*)$/i;

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
  // Bracket form: [scope:section] free text
  const match = body.match(SECTION_RE);
  if (match) {
    const [, section, rest] = match;
    return { [section!]: (rest ?? '').trim() };
  }
  // Equals form: Q<n>=<label>
  const eqMatch = body.match(/^(Q\d+)=([A-Z])$/);
  if (eqMatch) {
    return { [eqMatch[1]!]: eqMatch[2]! };
  }
  return {};
}
