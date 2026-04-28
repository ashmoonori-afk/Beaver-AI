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
  plan: Plan;
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
  const runsRoot = ctx.runsRoot ?? path.join(process.cwd(), 'runs');
  let state: RunState = 'INITIALIZED';

  // W.11 — optional refinement pass. When ctx.refiner is supplied the
  // orchestrator goes INITIALIZED -> REFINING_GOAL -> PLANNING via the
  // GOAL_REFINEMENT_STARTED + GOAL_REFINED events. Backward-compat:
  // without a refiner, the existing INITIALIZED + PLAN_DRAFTED -> PLANNING
  // path runs unchanged so every pre-W.11 test keeps working.
  if (ctx.refiner) {
    const refineState = await runGoalRefinement(ctx, state);
    if (refineState === 'FAILED' || refineState === 'ABORTED') {
      return { finalState: refineState };
    }
    state = refineState; // PLANNING
    persistPlanV1(ctx, runsRoot);
  } else {
    state = enterPlanning(ctx, state, runsRoot);
  }

  if (ctx.plan.tasks.length === 0) {
    state = applyTransition(ctx, state, { type: 'FINAL_REVIEW_REQUESTED' });
  } else {
    // Phase 7.3: validate handoff before dispatching the first coder.
    // Failure escalates to a human via an `escalation` checkpoint and
    // FAILS the run rather than burning budget on a doomed plan.
    const validation = ctx.skipHandoffValidation
      ? { ok: true as const }
      : validateHandoff(ctx.plan, { runCapUsd: ctx.runCapUsd ?? DEFAULT_RUN_CAP_USD });
    if (!validation.ok) {
      state = postHandoffEscalation(ctx, state, validation.errors);
      return { finalState: state };
    }
    state = applyTransition(ctx, state, { type: 'PLAN_APPROVED' });
    state = await runExecuteReview(ctx, state);
  }

  state = await runFinalReview(ctx, state);

  if (state === 'COMPLETED') updateRunStatus(ctx.db, ctx.runId, 'COMPLETED');
  return { finalState: state };
}

// ---------------------------------------------------------------------------
// State handlers — each is small and pure-ish around one boundary.

function enterPlanning(ctx: OrchestratorContext, state: RunState, runsRoot: string): RunState {
  const next = applyTransition(ctx, state, { type: 'PLAN_DRAFTED' });
  persistPlanV1(ctx, runsRoot);
  return next;
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
async function runGoalRefinement(
  ctx: OrchestratorContext,
  startState: RunState,
): Promise<RunState> {
  if (!ctx.refiner) return startState;
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
      return applyTransition(ctx, state, { type: 'GOAL_REFINED' });
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

    const response = await waitForAnswer(ctx.db, checkpointId, {
      pollMs: ctx.pollIntervalMs ?? 200,
    });

    if (APPROVE_RESPONSES.has(response)) {
      insertEvent(ctx.db, {
        run_id: ctx.runId,
        ts: now(),
        source: SOURCE,
        type: 'goal.refined',
        payload_json: JSON.stringify({ iteration: i, ready: false, decision: 'approve' }),
      });
      return applyTransition(ctx, state, { type: 'GOAL_REFINED' });
    }
    if (REJECT_RESPONSES.has(response)) {
      const next = applyTransition(ctx, state, {
        type: 'FAIL',
        reason: 'user rejected goal refinement',
      });
      updateRunStatus(ctx.db, ctx.runId, 'FAILED');
      return next;
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
  return applyTransition(ctx, state, { type: 'GOAL_REFINED' });
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

async function runExecuteReview(ctx: OrchestratorContext, startState: RunState): Promise<RunState> {
  let state = startState;
  const task = ctx.plan.tasks[0];
  if (!task) return state;

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

function persistPlanV1(ctx: OrchestratorContext, runsRoot: string): void {
  const planDir = path.join(runsRoot, ctx.runId, 'plan');
  fs.mkdirSync(planDir, { recursive: true });
  const planPath = path.join(planDir, 'plan-v1.json');
  fs.writeFileSync(planPath, JSON.stringify(ctx.plan, null, 2), 'utf8');
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
