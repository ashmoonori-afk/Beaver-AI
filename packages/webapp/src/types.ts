// Webapp data shapes. The Tauri shell (Phase 4D) and the Fastify
// server (legacy --server) both serialize against these — kept here
// (not imported from @beaver-ai/core) so the renderer never pulls
// node-only modules into the bundle.

export type RunState =
  | 'INITIALIZED'
  | 'REFINING_GOAL'
  | 'PLANNING'
  | 'EXECUTING'
  | 'REVIEWING'
  | 'INTEGRATING'
  | 'FINAL_REVIEW_PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED';

export type AgentRole = 'planner' | 'coder' | 'reviewer' | 'tester' | 'integrator' | 'summarizer';

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed';

/**
 * Phase 8 (D19): token counts as a first-class metric. Cost ticker
 * displays these directly when costMode==='tokens' (default for
 * subscription-CLI mode). When costMode==='usd' (direct-API mode) the
 * renderer falls back to spentUsd / budgetUsd.
 */
export interface TokenUsage {
  input: number;
  output: number;
  cached: number;
}

export interface TokenCap {
  /** Total input + output token cap for the run. Cached tokens don't
   *  count against the cap (Anthropic / OpenAI subscription tiers
   *  don't bill cache hits separately). */
  total: number;
}

export type CostMode = 'tokens' | 'usd';

export interface AgentSummary {
  id: string;
  role: AgentRole;
  provider: 'claude-code' | 'codex';
  status: AgentRunStatus;
  spentUsd: number;
  /** Phase 8 — per-agent token totals. Optional so older transports stay valid. */
  tokens?: TokenUsage;
  /** Last line of the agent's transcript — short caption shown in the card. */
  lastLine?: string;
}

export interface RunSnapshot {
  runId: string;
  state: RunState;
  /** ISO 8601. */
  startedAt: string;
  /** ISO 8601 once terminal. */
  endedAt?: string;
  spentUsd: number;
  budgetUsd: number;
  /** Phase 8 — run-level token totals. Sum of per-agent tokens. */
  tokens?: TokenUsage;
  /** Phase 8 — token cap. When omitted, defaults to 1M total. */
  tokenCap?: TokenCap;
  /** Phase 8 — selects which unit the CostTicker renders. Default 'tokens'. */
  costMode?: CostMode;
  agents: AgentSummary[];
  openCheckpoints: number;
}

export const TERMINAL_RUN_STATES: ReadonlySet<RunState> = new Set([
  'COMPLETED',
  'FAILED',
  'ABORTED',
]);

export const CHECKPOINT_KINDS = [
  'goal-clarification',
  'goal-refinement',
  'plan-approval',
  'risky-change-confirmation',
  'merge-conflict',
  'escalation',
  'final-review',
  'budget-exceeded',
] as const;

export type CheckpointKind = (typeof CHECKPOINT_KINDS)[number];

/** Optional wiki-sourced hint — sourced from `askWiki` per phase-5. */
export interface CheckpointHint {
  /** One short sentence shown above the body. */
  text: string;
  /** Wiki page paths that produced the hint. */
  sourcePages: string[];
}

/** Phase 7: structured payload that goes with a `goal-refinement` checkpoint.
 *  Phase W.10 (Ralph-inspired): adds optional `clarifyingQuestions`
 *  (lettered-option style for "1A, 2C, 3B" quick replies) + structured
 *  `prd` + `mvp` so the user reviews + nudges a real spec rather than
 *  a free-text paragraph. */
export interface GoalRefinement {
  /** What the user typed verbatim. */
  rawGoal: string;
  /** Planner's enriched draft. */
  enrichedGoal: string;
  /** Bullet list of assumptions the planner made while enriching. */
  assumptions: readonly string[];
  /** Free-form clarifying questions (legacy / fallback). */
  questions: readonly string[];
  /** W.10 — multi-choice clarifying questions. Empty/undefined when
   *  the planner is confident enough to skip. */
  clarifyingQuestions?: readonly ClarifyingQuestion[];
  /** W.10 — structured PRD. */
  prd?: PRD;
  /** W.10 — minimum viable subset of the PRD. */
  mvp?: MVP;
}

/** A single clarifying question with lettered options (Ralph pattern).
 *  User can reply quickly with e.g. "Q1: B". */
export interface ClarifyingQuestion {
  /** Stable id for routing per-question replies — typically "Q1", "Q2". */
  id: string;
  text: string;
  options: ReadonlyArray<ClarifyingOption>;
}

export interface ClarifyingOption {
  /** "A" | "B" | "C" | … */
  label: string;
  /** Concrete answer text the planner can act on. */
  value: string;
}

/** Acceptance-criteria-bearing user story per Ralph PRD skill. */
export interface UserStory {
  id: string;
  title: string;
  /** "As a <user>, I want <feature> so that <benefit>" sentence. */
  description: string;
  acceptanceCriteria: readonly string[];
}

/** Product Requirements Document — Ralph-inspired structure. */
export interface PRD {
  /** One-paragraph overview of the feature. */
  overview: string;
  /** Specific, measurable goals. */
  goals: readonly string[];
  userStories: readonly UserStory[];
  /** What this explicitly will NOT do. */
  nonGoals: readonly string[];
  /** Verifiable signals that the feature is shipped. */
  successMetrics: readonly string[];
}

/** Minimum viable subset of the PRD — first cut to ship. */
export interface MVP {
  /** One-sentence elevator pitch. */
  pitch: string;
  /** Smallest feature set that delivers user value. */
  features: readonly string[];
  /** PRD goals/features explicitly deferred past v0.1. */
  deferred: readonly string[];
  /** Time + scope budget (e.g. "2 weeks · single-user · no auth"). */
  scope: string;
}

export interface CheckpointSummary {
  id: string;
  runId: string;
  kind: CheckpointKind;
  /** Human-readable question the agent posed. */
  prompt: string;
  /** ISO 8601 — when the checkpoint was opened. */
  postedAt: string;
  /** Optional wiki hint surfaced via `HintLine` (W.4 / 4U.5). */
  hint?: CheckpointHint;
  /** Phase 7: present only when kind === 'goal-refinement'. */
  refinement?: GoalRefinement;
}

/** A row of a plan version (W.5 / 4U.4). Same compact list the CLI renders. */
export interface PlanTask {
  id: string;
  agentRole: AgentRole;
  /** Short human-readable line, e.g. "Add /api/users route". */
  title: string;
  /** Optional dependency list (task ids that must finish first). */
  dependsOn?: readonly string[];
}

export interface PlanSummary {
  /** Stable id assigned by the orchestrator (e.g. `plan-1`, `plan-2`). */
  id: string;
  runId: string;
  /** Monotonically increasing version number — the dropdown sorts by this. */
  version: number;
  /** ISO 8601. */
  createdAt: string;
  tasks: readonly PlanTask[];
}

export type LogEventLevel = 'info' | 'warn' | 'error' | 'debug';

/** One row of the streaming log view. Sourced from the orchestrator's
 *  audit log. The renderer never parses NDJSON — the transport decoder does. */
export interface LogEvent {
  id: string;
  runId: string;
  /** ISO 8601. */
  ts: string;
  level: LogEventLevel;
  /** Source tag, e.g. `claude-code`, `codex`, `orchestrator`, `hook`. */
  source: string;
  /** Single-line message. */
  message: string;
  /** Raw NDJSON line — surfaced by the `--json` toggle. */
  raw?: string;
}

export interface BranchSummary {
  /** `beaver/<run>/<agent>` per the docs. */
  ref: string;
  agentRole: AgentRole;
  /** Diff stats from the server — never computed on the client. */
  diff: DiffStat;
}

export interface DiffStat {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

/** Hero card data for the #review panel. */
export interface FinalReportSummary {
  runId: string;
  /** ISO 8601 of when the orchestrator wrote final-report.md. */
  generatedAt: string;
  /** Markdown body. Rendered via react-markdown with HTML disabled. */
  markdown: string;
  branches: readonly BranchSummary[];
}

/** One citation row beneath the wiki Q&A answer (W.6 / 4U.5). */
export interface WikiCitation {
  /** Wiki page path, e.g. `runs/2026-04-21-billing.md`. */
  path: string;
  /** First N lines of the page surfaced as a quote — server truncates. */
  excerpt: string;
  /** True when the server clipped the excerpt below its full length. */
  truncated: boolean;
}

export interface WikiAnswer {
  /** Plain text answer from `askWiki`. May be empty for empty-wiki case. */
  text: string;
  citations: readonly WikiCitation[];
  /** True when the server returned the empty-wiki fallback. The UI shows
   *  "no relevant entry yet" instead of the answer in that case. */
  empty: boolean;
}

/** Phase 1-D — one phase's slice of a run's spend. The Rust side
 *  derives `phase` by correlating each `costs` row with the most
 *  recent `state.transition` event for that run, so the renderer
 *  doesn't have to replay events. */
export interface CostBreakdownEntry {
  /** FSM phase that the orchestrator was in when the cost was incurred.
   *  Matches one of `RunState`, or 'UNKNOWN' for cost rows that pre-date
   *  any state.transition (legacy/edge-case data). */
  phase: string;
  usd: number;
  tokensIn: number;
  tokensOut: number;
}
