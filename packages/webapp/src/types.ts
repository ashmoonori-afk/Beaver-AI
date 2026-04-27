// Webapp data shapes. The Tauri shell (Phase 4D) and the Fastify
// server (legacy --server) both serialize against these — kept here
// (not imported from @beaver-ai/core) so the renderer never pulls
// node-only modules into the bundle.

export type RunState =
  | 'INITIALIZED'
  | 'PLANNING'
  | 'EXECUTING'
  | 'REVIEWING'
  | 'FINAL_REVIEW_PENDING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABORTED';

export type AgentRole = 'planner' | 'coder' | 'reviewer' | 'tester' | 'integrator' | 'summarizer';

export type AgentRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'killed';

export interface AgentSummary {
  id: string;
  role: AgentRole;
  provider: 'claude-code' | 'codex';
  status: AgentRunStatus;
  spentUsd: number;
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
}
