// Orchestrator finite state machine.
//
// Per docs/architecture/orchestrator.md: a deterministic top-level state
// machine drives the run; LLM calls handle judgment-call sub-decisions inside
// each state. This module owns the *transition* function only — no I/O, no
// LLM calls, no event-table writes. Callers (loop.ts) wrap each transition
// with the persistence side effects.
//
// Design notes
// - States and events are string-literal unions so the TS compiler enforces
//   exhaustiveness in `transition` via the `never` check at the bottom.
// - Invalid transitions throw `InvalidTransitionError(from, to)` so the
//   orchestrator can decide whether to escalate or abort.
// - INTEGRATING (Phase 2-A) merges per-task worktree branches into the
//   user's working branch in the parallel-execution path. Sequential
//   mode skips it (single worktree → no merges to do).

export const RUN_STATES = [
  'INITIALIZED',
  'REFINING_GOAL',
  'PLANNING',
  'EXECUTING',
  'REVIEWING',
  'INTEGRATING',
  'FINAL_REVIEW_PENDING',
  'COMPLETED',
  'FAILED',
  'ABORTED',
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const TERMINAL_STATES: ReadonlySet<RunState> = new Set<RunState>([
  'COMPLETED',
  'FAILED',
  'ABORTED',
]);

export type RunEvent =
  | { type: 'GOAL_REFINEMENT_STARTED' }
  | { type: 'GOAL_REFINED' }
  | { type: 'PLAN_DRAFTED' }
  | { type: 'PLAN_APPROVED' }
  | { type: 'TASK_DISPATCHED' }
  | { type: 'TASK_COMPLETED' }
  | { type: 'REVIEW_DONE' }
  | { type: 'INTEGRATION_STARTED' }
  | { type: 'INTEGRATION_DONE' }
  | { type: 'FINAL_REVIEW_REQUESTED' }
  | { type: 'FINAL_APPROVED' }
  | { type: 'FAIL'; reason: string }
  | { type: 'ABORT'; reason: string };

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: RunState,
    public readonly attemptedTo: RunState | '<unknown>',
    public readonly eventType: RunEvent['type'],
  ) {
    super(
      `invalid orchestrator transition: from=${from} event=${eventType} attempted=${attemptedTo}`,
    );
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Pure transition function. Throws InvalidTransitionError for any
 * (state, event) pair not in the documented machine.
 *
 * FAIL/ABORT are universal escape hatches — accepted from every non-terminal
 * state. Terminal states accept no events at all.
 */
export function transition(state: RunState, event: RunEvent): RunState {
  if (TERMINAL_STATES.has(state)) {
    throw new InvalidTransitionError(state, '<unknown>', event.type);
  }

  // Universal escape hatches.
  if (event.type === 'FAIL') return 'FAILED';
  if (event.type === 'ABORT') return 'ABORTED';

  switch (state) {
    case 'INITIALIZED':
      // Phase 7: explicit refinement pass.
      if (event.type === 'GOAL_REFINEMENT_STARTED') return 'REFINING_GOAL';
      // Backward compat: skipping refinement still works (used by tests
      // that pre-build a Plan and dispatch directly).
      if (event.type === 'PLAN_DRAFTED') return 'PLANNING';
      break;
    case 'REFINING_GOAL':
      // Refiner can re-enter itself when a clarifying question round
      // produces another revision (no event needed; the orchestrator
      // simply doesn't transition out yet). GOAL_REFINED commits the
      // enriched goal and the planner has drafted a plan from it.
      if (event.type === 'GOAL_REFINED') return 'PLANNING';
      break;
    case 'PLANNING':
      if (event.type === 'PLAN_APPROVED') return 'EXECUTING';
      // Empty-plan shortcut — go straight to final review.
      if (event.type === 'FINAL_REVIEW_REQUESTED') return 'FINAL_REVIEW_PENDING';
      break;
    case 'EXECUTING':
      if (event.type === 'TASK_DISPATCHED') return 'EXECUTING';
      if (event.type === 'TASK_COMPLETED') return 'REVIEWING';
      // Phase 2-A — parallel mode skips REVIEWING (per-task review
      // happens inside the worker pool) and goes straight to
      // INTEGRATING after all workers are done.
      if (event.type === 'INTEGRATION_STARTED') return 'INTEGRATING';
      break;
    case 'REVIEWING':
      if (event.type === 'REVIEW_DONE') return 'EXECUTING';
      if (event.type === 'FINAL_REVIEW_REQUESTED') return 'FINAL_REVIEW_PENDING';
      break;
    case 'INTEGRATING':
      // Phase 2-A — only success exit. Conflicts are resolved via
      // checkpoints and re-attempted from inside this state, so the
      // FSM never re-enters from REVIEWING.
      if (event.type === 'INTEGRATION_DONE') return 'FINAL_REVIEW_PENDING';
      break;
    case 'FINAL_REVIEW_PENDING':
      if (event.type === 'FINAL_APPROVED') return 'COMPLETED';
      break;
    case 'COMPLETED':
    case 'FAILED':
    case 'ABORTED':
      // Unreachable: terminal states are handled by the early return above.
      // Listed here so the compiler sees the switch as exhaustive.
      break;
    default: {
      // Exhaustiveness: if a new state is added without a case, this
      // assignment fails to compile.
      const _exhaustive: never = state;
      void _exhaustive;
    }
  }

  throw new InvalidTransitionError(state, '<unknown>', event.type);
}
