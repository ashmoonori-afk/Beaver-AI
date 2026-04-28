// Orchestrator loop. Drives the FSM through PLANNING -> EXECUTING ->
// REVIEWING -> FINAL_REVIEW_PENDING -> COMPLETED for the v0.1 single-task
// happy path.
//
// Spaghetti rules (per phase-2 conventions)
// - Transition logic lives in fsm.ts. This file only orchestrates side
//   effects around each transition.
// - Each FSM state has its own small handler — no `switch (state)` cascades
//   with embedded business logic.
// - Every transition is preceded by an append to `events` (state.transition)
//   so a crash leaves an authoritative breadcrumb for resume.

import fs from 'node:fs';
import path from 'node:path';

import type { Plan, Task } from '../plan/schema.js';
import type { RunResult } from '../types/provider.js';
import type { Db } from '../workspace/db.js';
import {
  getCheckpoint,
  insertCheckpoint,
  type CheckpointRow,
} from '../workspace/dao/checkpoints.js';
import { insertEvent } from '../workspace/dao/events.js';
import { insertPlan } from '../workspace/dao/plans.js';
import { updateRunStatus } from '../workspace/dao/runs.js';

import { waitForAnswer } from '../feedback/checkpoint.js';
import type { Planner } from '../planning/llm-planner.js';

import { transition, type RunState } from './fsm.js';
import { validateHandoff, type HandoffError } from './handoff.js';
import {
  MAX_REFINEMENT_ITERATIONS,
  encodeRefinementPrompt,
  parseSectionEdits,
  type Refiner,
  type RefinementResult,
} from './refiner.js';

const SOURCE = 'orchestrator';
const FINAL_REVIEW_KIND = 'final-review';
const ESCALATION_KIND = 'escalation';
const GOAL_REFINEMENT_KIND = 'goal-refinement';
const APPROVE_RESPONSES = new Set(['approve', 'approved', 'yes']);
const REJECT_RESPONSES = new Set(['reject', 'rejected', 'no']);
const DEFAULT_RUN_CAP_USD = 20;

export interface OrchestratorContext {
  db: Db;
  runId: string;
  goal: string;
  /** Pre-built plan. Optional when `planner` is supplied — the planner
   *  callback constructs one from the approved refinement after the
   *  REFINING_GOAL phase. Existing tests pass `plan` directly and skip
   *  refinement/planner; production wiring (W.12.3) supplies `planner`
   *  and lets the orchestrator derive the plan from the PRD. */
  plan?: Plan;
  /** Phase W.12.3 — produces a Plan from the approved refinement (PRD/MVP).
   *  Called after `runGoalRefinement` resolves. When omitted, `ctx.plan`
   *  must be supplied. */
  planner?: Planner;
  /** Root for plan/transcript files. Defaults to cwd/runs. */
  runsRoot?: string;
  /** Single-task executor. Returns RunResult; loop owns review/transition. */
  executor?: (task: Task) => Promise<RunResult>;
  /** Reviewer sub-decision; defaults to always-accept for v0.1 happy path. */
  reviewer?: (
    taskId: string,
    result: RunResult,
  ) => Promise<{ verdict: 'accept' | 'retry' | 'escalate'; reason: string }>;
  /** Optional final-review summary text. */
  finalReviewPrompt?: string;
  /** Polling interval for checkpoint answers (default 200 ms). */
  pollIntervalMs?: number;
  /** Hard cap on poll waiting (default 60 s; tests inject smaller). */
  pollTimeoutMs?: number;
  /** Hard cap on goal-refinement checkpoint waits. Defaults to 30 min;
   *  refinement requires a human response so the cap must be much larger
   *  than the orchestrator's normal poll timeout. */
  refinementTimeoutMs?: number;
  /** Run-level USD cap for handoff validation (Phase 7.3). Defaults to $20. */
  runCapUsd?: number;
  /** Skip handoff validation (Phase 7.3). Tests with intentional cycles use this. */
  skipHandoffValidation?: boolean;
  /** Phase W.11 — optional goal-refinement callback. When supplied, the
   *  orchestrator runs an explicit REFINING_GOAL pass before drafting
   *  the plan. Each iteration may post a `goal-refinement` checkpoint
   *  with the structured PRD/MVP payload + clarifying questions; user
   *  comments are parsed into section-targeted edits and threaded back
   *  into the next refiner call. Cap: MAX_REFINEMENT_ITERATIONS. */
  refiner?: Refiner;
}

export interface OrchestratorRunResult {
  finalState: RunState;
}

/**
 * Drive a single run from INITIALIZED to a terminal state.
 *
 * v0.1 supports the empty-plan path and the single-task path. Multi-task
 * planning is deferred to v0.2 (INTEGRATING state).
 */
export async function runOrchestrator(ctx: OrchestratorContext): Promise<OrchestratorRunResult> {
  // review-pass v0.1: default runsRoot under .beaver/ so plans land
  // alongside the SQLite ledger rather than in a sibling `runs/` dir.
  const runsRoot = ctx.runsRoot ?? path.join(process.cwd(), '.beaver', 'runs');
  let state: RunState = 'INITIALIZED';
  let refinement: RefinementResult | null = null;

  // W.11 — optional refinement pass. INITIALIZED -> REFINING_GOAL -> PLANNING
  // via GOAL_REFINEMENT_STARTED + GOAL_REFINED. Without ctx.refiner the
  // INITIALIZED + PLAN_DRAFTED -> PLANNING fallback path runs (backward compat).
  if (ctx.refiner) {
    const outcome = await runGoalRefinement(ctx, state);
    if (outcome.state === 'FAILED' || outcome.state === 'ABORTED') {
      return { finalState: outcome.state };
    }
    state = outcome.state; // PLANNING
    refinement = outcome.refinement;
  }

  // W.12.3 — resolve the plan. Planner wins (PRD-driven), else pre-built
  // ctx.plan, else hard programmer error (re-thrown).
  // review-pass v0.1: previously, a planner throw at runtime left the
  // run_status as RUNNING forever. Catch RUNTIME errors and transition
  // to FAILED so the renderer sees a terminal state. The misconfig
  // case (no plan AND no planner) is a programmer error and is
  // re-thrown unchanged so callers get a stack trace at startup.
  if (!ctx.plan && !ctx.planner) {
    throw new Error('runOrchestrator: ctx.plan or ctx.planner must be supplied; got neither.');
  }
  let plan: Plan;
  try {
    plan = await resolvePlan(ctx, refinement);
  } catch (err) {
    const next = applyTransition(ctx, state, {
      type: 'FAIL',
      reason: err instanceof Error ? err.message : String(err),
    });
    updateRunStatus(ctx.db, ctx.runId, 'FAILED');
    return { finalState: next };
  }
  if (!ctx.refiner) {
    state = applyTransition(ctx, state, { type: 'PLAN_DRAFTED' });
  }
  await persistPlanV1(ctx, plan, runsRoot);

  if (plan.tasks.length === 0) {
    state = applyTransition(ctx, state, { type: 'FINAL_REVIEW_REQUESTED' });
  } else {
    // Phase 7.3 handoff validation.
    const validation = ctx.skipHandoffValidation
      ? { ok: true as const }
      : validateHandoff(plan, { runCapUsd: ctx.runCapUsd ?? DEFAULT_RUN_CAP_USD });
    if (!validation.ok) {
      state = postHandoffEscalation(ctx, state, validation.errors);
      return { finalState: state };
    }
    state = applyTransition(ctx, state, { type: 'PLAN_APPROVED' });
    state = await runExecuteReview(ctx, plan, state);
  }

  state = await runFinalReview(ctx, state);

  if (state === 'COMPLETED') updateRunStatus(ctx.db, ctx.runId, 'COMPLETED');
  return { finalState: state };
}

// ---------------------------------------------------------------------------
// State handlers — each is small and pure-ish around one boundary.

/** W.12.3 — resolve a Plan from the orchestrator context.
 *
 *  Priority: ctx.planner (PRD-driven) > ctx.plan (pre-built) > error.
 *  When the planner is available, it sees the approved refinement so
 *  it can map PRD user stories to plan tasks.
 */
async function resolvePlan(
  ctx: OrchestratorContext,
  refinement: RefinementResult | null,
): Promise<Plan> {
  if (ctx.planner) {
    return ctx.planner({
      rawGoal: ctx.goal,
      ...(refinement !== null ? { refinement } : {}),
    });
  }
  if (ctx.plan) return ctx.plan;
  throw new Error('runOrchestrator: ctx.plan or ctx.planner must be supplied; got neither.');
}

/**
 * W.11 — drive REFINING_GOAL.
 *
 * Calls ctx.refiner up to MAX_REFINEMENT_ITERATIONS times. Each non-ready
 * iteration posts a `goal-refinement` checkpoint whose `prompt` is the
 * JSON-encoded RefinementPromptPayload. User responses:
 *   - approve / yes        -> commit the latest refinement, transition to PLANNING
 *   - reject / no          -> FAIL the run cleanly
 *   - comment:[scope:sec]… -> parse section edits, re-run refiner with them
 *
 * If the refiner returns ready=true on any iteration, transitions
 * immediately without posting a checkpoint. Iteration cap reached
 * without convergence falls through to PLANNING with the latest result
 * (anti-deadlock guard).
 *
 * Returns the FSM state after this phase: PLANNING on success, FAILED or
 * ABORTED on terminal exit.
 */
interface RefinementOutcome {
  state: RunState;
  /** Last refinement produced (used by the planner). null when run was
   *  rejected by the user. */
  refinement: RefinementResult | null;
}

async function runGoalRefinement(
  ctx: OrchestratorContext,
  startState: RunState,
): Promise<RefinementOutcome> {
  if (!ctx.refiner) return { state: startState, refinement: null };
  const state = applyTransition(ctx, startState, { type: 'GOAL_REFINEMENT_STARTED' });
  let priorResponse: string | undefined;
  let sectionEdits: Record<string, string> = {};
  let lastRefinement: RefinementResult | null = null;

  for (let i = 0; i < MAX_REFINEMENT_ITERATIONS; i += 1) {
    const refinement = await ctx.refiner({
      rawGoal: ctx.goal,
      ...(priorResponse !== undefined ? { priorResponse } : {}),
      ...(Object.keys(sectionEdits).length > 0 ? { sectionEdits } : {}),
    });
    lastRefinement = refinement;

    if (refinement.ready) {
      insertEvent(ctx.db, {
        run_id: ctx.runId,
        ts: now(),
        source: SOURCE,
        type: 'goal.refined',
        payload_json: JSON.stringify({ iteration: i, ready: true }),
      });
      return {
        state: applyTransition(ctx, state, { type: 'GOAL_REFINED' }),
        refinement,
      };
    }

    const checkpointId = `${ctx.runId}:goal-refinement:${i}`;
    insertCheckpoint(ctx.db, {
      id: checkpointId,
      run_id: ctx.runId,
      kind: GOAL_REFINEMENT_KIND,
      status: 'pending',
      prompt: encodeRefinementPrompt({
        rawGoal: ctx.goal,
        iteration: i,
        refinement,
      }),
    });

    // review-pass v0.1: refinement waits used to hang forever. Cap
    // with a long-but-finite timeout so a never-answered checkpoint
    // surfaces a clear FAILED state rather than an infinite loop.
    const refinementTimeoutMs = ctx.refinementTimeoutMs ?? 30 * 60 * 1000;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), refinementTimeoutMs);
    let response: string;
    try {
      response = await waitForAnswer(ctx.db, checkpointId, {
        pollMs: ctx.pollIntervalMs ?? 200,
        signal: ac.signal,
      });
    } catch (err) {
      const next = applyTransition(ctx, state, {
        type: 'FAIL',
        reason: ac.signal.aborted
          ? `goal-refinement checkpoint not answered within ${refinementTimeoutMs} ms`
          : err instanceof Error
            ? err.message
            : String(err),
      });
      updateRunStatus(ctx.db, ctx.runId, 'FAILED');
      return { state: next, refinement };
    } finally {
      clearTimeout(timer);
    }

    if (APPROVE_RESPONSES.has(response)) {
      insertEvent(ctx.db, {
        run_id: ctx.runId,
        ts: now(),
        source: SOURCE,
        type: 'goal.refined',
        payload_json: JSON.stringify({ iteration: i, ready: false, decision: 'approve' }),
      });
      return {
        state: applyTransition(ctx, state, { type: 'GOAL_REFINED' }),
        refinement,
      };
    }
    if (REJECT_RESPONSES.has(response)) {
      const next = applyTransition(ctx, state, {
        type: 'FAIL',
        reason: 'user rejected goal refinement',
      });
      updateRunStatus(ctx.db, ctx.runId, 'FAILED');
      return { state: next, refinement: null };
    }
    // comment:… — accumulate section edits and loop.
    priorResponse = response;
    sectionEdits = { ...sectionEdits, ...parseSectionEdits(response) };
  }

  // Iteration cap reached. Advance with the latest refinement so the
  // run never deadlocks. Audit log records the cap-out.
  insertEvent(ctx.db, {
    run_id: ctx.runId,
    ts: now(),
    source: SOURCE,
    type: 'goal.refined',
    payload_json: JSON.stringify({
      iteration: MAX_REFINEMENT_ITERATIONS,
      ready: false,
      decision: 'iteration-cap',
      hadRefinement: lastRefinement !== null,
    }),
  });
  return {
    state: applyTransition(ctx, state, { type: 'GOAL_REFINED' }),
    refinement: lastRefinement,
  };
}

/**
 * Phase 7.3 — handoff validator failed. Post an `escalation` checkpoint
 * with a one-line summary per error so the user can see exactly which
 * task / plan-level rule broke, then FAIL the run cleanly. The
 * checkpoint is informational; the run does not wait for an answer.
 */
function postHandoffEscalation(
  ctx: OrchestratorContext,
  state: RunState,
  errors: readonly HandoffError[],
): RunState {
  // Drive the FSM to FAILED first so even if the audit-log writes
  // below throw (DB constraint, locked file, ...), the run never
  // strands in a non-terminal status. The checkpoint + event are
  // best-effort metadata; the FAIL transition is the contract.
  const next = applyTransition(ctx, state, {
    type: 'FAIL',
    reason: `handoff: ${errors.length} validator(s) failed`,
  });
  updateRunStatus(ctx.db, ctx.runId, 'FAILED');
  const summary = errors.map((e) => `[${e.validator}] ${e.scope}: ${e.message}`).join('\n');
  try {
    insertCheckpoint(ctx.db, {
      id: `${ctx.runId}:handoff-escalation`,
      run_id: ctx.runId,
      kind: ESCALATION_KIND,
      status: 'pending',
      prompt: `Handoff validation failed before dispatch:\n\n${summary}`,
    });
    insertEvent(ctx.db, {
      run_id: ctx.runId,
      ts: now(),
      source: SOURCE,
      type: 'handoff.failed',
      payload_json: JSON.stringify({ errors }),
    });
  } catch {
    // Already FAILED; the human-facing breadcrumb just won't appear
    // in the dashboard. The run cannot get stuck.
  }
  return next;
}

async function runExecuteReview(
  ctx: OrchestratorContext,
  plan: Plan,
  startState: RunState,
): Promise<RunState> {
  let state = startState;
  const task = plan.tasks[0];
  if (!task) return state;

  // review-pass v0.1: v0.1 dispatches a single task. The LLM planner
  // can emit multi-task plans; rather than silently dropping the
  // remainder we surface it as an audit-log warning so users know
  // why only the first task ran. Multi-task INTEGRATING is v0.2.
  if (plan.tasks.length > 1) {
    insertEvent(ctx.db, {
      run_id: ctx.runId,
      ts: now(),
      source: SOURCE,
      type: 'plan.multitask_truncated',
      payload_json: JSON.stringify({
        kept: task.id,
        dropped: plan.tasks.slice(1).map((t) => t.id),
        note: 'v0.1 single-task; multi-task scheduling is v0.2.',
      }),
    });
  }

  state = applyTransition(ctx, state, { type: 'TASK_DISPATCHED' });
  const result = await dispatchTask(ctx, task);

  if (result.status !== 'ok') {
    const next = applyTransition(ctx, state, {
      type: 'FAIL',
      reason: `task-${result.status}: ${result.summary}`,
    });
    updateRunStatus(ctx.db, ctx.runId, 'FAILED');
    return next;
  }

  state = applyTransition(ctx, state, { type: 'TASK_COMPLETED' });

  const verdict = await reviewResult(ctx, task.id, result);
  insertEvent(ctx.db, {
    run_id: ctx.runId,
    ts: now(),
    source: SOURCE,
    type: 'review.verdict',
    payload_json: JSON.stringify({ taskId: task.id, ...verdict }),
  });

  if (verdict.verdict === 'accept') {
    state = applyTransition(ctx, state, { type: 'FINAL_REVIEW_REQUESTED' });
  } else {
    // v0.1: anything that is not 'accept' fails the run cleanly.
    state = applyTransition(ctx, state, {
      type: 'FAIL',
      reason: `review-${verdict.verdict}: ${verdict.reason}`,
    });
    updateRunStatus(ctx.db, ctx.runId, 'FAILED');
  }
  return state;
}

async function runFinalReview(ctx: OrchestratorContext, startState: RunState): Promise<RunState> {
  if (startState !== 'FINAL_REVIEW_PENDING') return startState;
  const checkpointId = `${ctx.runId}:final-review`;
  insertCheckpoint(ctx.db, {
    id: checkpointId,
    run_id: ctx.runId,
    kind: FINAL_REVIEW_KIND,
    status: 'pending',
    prompt: ctx.finalReviewPrompt ?? `Approve completion for goal: ${ctx.goal}`,
  });
  const answer = await pollForAnswer(ctx, checkpointId);
  if (answer && APPROVE_RESPONSES.has(answer.trim().toLowerCase())) {
    return applyTransition(ctx, startState, { type: 'FINAL_APPROVED' });
  }
  const next = applyTransition(ctx, startState, {
    type: 'ABORT',
    reason: `final-review: ${answer ?? '<no-answer>'}`,
  });
  updateRunStatus(ctx.db, ctx.runId, 'ABORTED');
  return next;
}

// ---------------------------------------------------------------------------
// Side-effect helpers.

function applyTransition(
  ctx: OrchestratorContext,
  from: RunState,
  event: Parameters<typeof transition>[1],
): RunState {
  const to = transition(from, event);
  insertEvent(ctx.db, {
    run_id: ctx.runId,
    ts: now(),
    source: SOURCE,
    type: 'state.transition',
    payload_json: JSON.stringify({
      from,
      to,
      event: event.type,
      ...('reason' in event ? { reason: event.reason } : {}),
    }),
  });
  return to;
}

async function persistPlanV1(
  ctx: OrchestratorContext,
  plan: Plan,
  runsRoot: string,
): Promise<void> {
  const planDir = path.join(runsRoot, ctx.runId, 'plan');
  await fs.promises.mkdir(planDir, { recursive: true });
  const planPath = path.join(planDir, 'plan-v1.json');
  // review-pass v0.1: async write so the orchestrator's event loop
  // doesn't block on slow disks. Failures here propagate up to the
  // outer try/catch in runOrchestrator that transitions to FAILED.
  await fs.promises.writeFile(planPath, JSON.stringify(plan, null, 2), 'utf8');
  insertPlan(ctx.db, {
    id: `${ctx.runId}:plan:1`,
    run_id: ctx.runId,
    version: 1,
    content_path: planPath,
  });
}

async function dispatchTask(ctx: OrchestratorContext, task: Task): Promise<RunResult> {
  if (!ctx.executor) {
    throw new Error(`runOrchestrator: plan has tasks but no executor was provided`);
  }
  return ctx.executor(task);
}

async function reviewResult(
  ctx: OrchestratorContext,
  taskId: string,
  result: RunResult,
): Promise<{ verdict: 'accept' | 'retry' | 'escalate'; reason: string }> {
  if (ctx.reviewer) return ctx.reviewer(taskId, result);
  return { verdict: 'accept', reason: 'no-reviewer-configured' };
}

async function pollForAnswer(
  ctx: OrchestratorContext,
  checkpointId: string,
): Promise<string | null> {
  const interval = ctx.pollIntervalMs ?? 200;
  const timeout = ctx.pollTimeoutMs ?? 60_000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const row: CheckpointRow | null = getCheckpoint(ctx.db, checkpointId);
    if (row && row.status === 'answered') return row.response;
    await sleep(interval);
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function now(): string {
  return new Date().toISOString();
}
