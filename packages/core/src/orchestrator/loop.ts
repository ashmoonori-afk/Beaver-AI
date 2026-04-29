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
import { spawn } from 'node:child_process';
import path from 'node:path';

import {
  abortMerge,
  createWorktree,
  mergeBranchInto,
  removeWorktree,
} from '../agent-runtime/worktree.js';
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
import type { DispatchResult } from '../prd/dispatcher.js';
import { recordMetric } from '../metrics.js';
import { freezePrd } from '../prd/freeze.js';
import { renderRefinementAsMarkdown } from '../prd/render.js';
import type { WikiQueryFn } from '../wiki/checkpoint-hook.js';
import { insertPrdRun, listPrdRunsByRunId } from '../workspace/dao/prd_runs.js';

import { transition, type RunState } from './fsm.js';
import { validateHandoff, type HandoffError } from './handoff.js';
import {
  MAX_REFINEMENT_ITERATIONS,
  encodeRefinementPrompt,
  parseSectionEdits,
  type ParentRunContext,
  type Refiner,
  type RefinementResult,
} from './refiner.js';

const SOURCE = 'orchestrator';
const FINAL_REVIEW_KIND = 'final-review';
const ESCALATION_KIND = 'escalation';
const GOAL_REFINEMENT_KIND = 'goal-refinement';
const PLAN_APPROVAL_KIND = 'plan-approval';
const MERGE_CONFLICT_KIND = 'merge-conflict';
const APPROVE_RESPONSES = new Set(['approve', 'approved', 'yes']);
const REJECT_RESPONSES = new Set(['reject', 'rejected', 'no']);
// Phase 2-A — merge-conflict checkpoint vocabulary. `resolve` means the
// user fixed the conflict in the working tree and the orchestrator
// should commit + continue; anything else is treated as abort.
const RESOLVE_RESPONSES = new Set(['resolve', 'resolved', 'continue']);
const DEFAULT_RUN_CAP_USD = 20;
const DEFAULT_MAX_PARALLEL_TASKS = 1;

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
  /** Single-task executor. Returns RunResult; loop owns review/transition.
   *  Phase 2-A — accepts an optional `{ workdir }` so the parallel path
   *  can route the agent into a per-task worktree. Sequential mode
   *  callers can ignore the second arg. */
  executor?: (task: Task, opts?: { workdir?: string }) => Promise<RunResult>;
  /** Reviewer sub-decision; defaults to always-accept when neither
   *  `reviewer` nor `makeReviewer` is supplied. */
  reviewer?: (
    taskId: string,
    result: RunResult,
  ) => Promise<{ verdict: 'accept' | 'retry' | 'escalate'; reason: string }>;
  /** Phase 1-A — lazy reviewer factory. The orchestrator calls this
   *  with the resolved plan so the reviewer has acceptance criteria
   *  and per-task context for its prompt. Use either `reviewer`
   *  (instance) or `makeReviewer` (factory) — not both. When both are
   *  set, `makeReviewer` wins. */
  makeReviewer?: (
    plan: Plan,
  ) => (
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
  /** v0.1.1-C — parent run context for follow-up runs. Threaded into
   *  the refiner and planner inputs so they produce incremental edits
   *  on top of the parent rather than re-doing work. */
  parentContext?: ParentRunContext;
  /** Phase 2-A — concurrency limit for the parallel-worktree
   *  execution path. Default 1 (sequential, single-worktree path
   *  preserved). Values >1 enable per-task worktrees + sequential
   *  INTEGRATING merges. */
  maxParallelTasks?: number;
  /** Phase 2-A — repo root used as the source for `git worktree add`
   *  and as the destination of merges in INTEGRATING. Defaults to
   *  process.cwd(). The user's project directory in production. */
  repoRoot?: string;
  /** Phase 2-A — root directory for per-task worktrees. Defaults to
   *  `<repoRoot>/.beaver/worktrees/<runId>/`. Each task gets a
   *  subdirectory named for the task id. */
  worktreesRoot?: string;
  /** Sprint A — when true OR env BEAVER_AUTO_APPROVE_PLAN=1, the
   *  orchestrator skips posting a plan-approval checkpoint and fires
   *  PLAN_APPROVED directly. Default false → post the checkpoint and
   *  block on the user's response. Tests set this true to keep the
   *  legacy non-interactive flow. */
  autoApprovePlan?: boolean;
  /** Sprint A — hard cap on plan-approval checkpoint waits. Defaults
   *  to 30 min so a brief poll cap (e.g. pollTimeoutMs=30s) doesn't
   *  abort the run while a human is reading the plan. */
  planApprovalTimeoutMs?: number;
  /** Sprint C — optional wiki hint provider. When set, the orchestrator
   *  invokes it before posting human-decision checkpoints
   *  (plan-approval, final-review, escalation) and prepends the
   *  returned hint to the prompt body. Suppress with
   *  BEAVER_DISABLE_WIKI_HINTS=1 (api.ts wiring respects this). */
  wikiQuery?: WikiQueryFn;
  /** v0.2 M2 — PRD-task dispatcher closure. When set AND a prd_runs
   *  row exists for this run (= the user approved the goal-refinement
   *  checkpoint), the orchestrator routes the EXECUTING phase
   *  through this dispatcher instead of the v0.1 plan executor.
   *  Returns a DispatchResult; the orchestrator maps its outcome
   *  onto the FSM transitions. */
  runPrdDispatch?: (prdRunId: string, repoRoot: string) => Promise<DispatchResult>;
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
  // v0.2 M4.2 — KR1/KR2/KR5 metrics. Captured around the goal-submit
  // and final-state transitions so PRD confirm latency + total run
  // duration land in metrics.jsonl without touching the FSM.
  const submittedAtMs = Date.now();
  let confirmedAtMs: number | null = null;
  let usedPrdPath = false;

  // W.11 — optional refinement pass. INITIALIZED -> REFINING_GOAL -> PLANNING
  // via GOAL_REFINEMENT_STARTED + GOAL_REFINED. Without ctx.refiner the
  // INITIALIZED + PLAN_DRAFTED -> PLANNING fallback path runs (backward compat).
  if (ctx.refiner) {
    const outcome = await runGoalRefinement(ctx, state);
    if (outcome.state === 'FAILED' || outcome.state === 'ABORTED') {
      // Capture KR2/KR5 for early-fail runs too so a stuck refiner
      // shows up in the metrics file rather than silently disappearing.
      emitFinalMetrics(ctx, outcome.state, submittedAtMs, confirmedAtMs, usedPrdPath);
      return { finalState: outcome.state };
    }
    state = outcome.state; // PLANNING
    refinement = outcome.refinement;
    if (refinement && hasRealPrd(refinement)) {
      confirmedAtMs = Date.now();
      if (ctx.repoRoot) {
        recordMetric(ctx.repoRoot, {
          kr: 'KR1',
          runId: ctx.runId,
          submittedAtMs,
          confirmedAtMs,
          deltaMs: confirmedAtMs - submittedAtMs,
        });
      }
    }
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
  // Phase 1-A — instantiate the reviewer lazily once we have the plan.
  // ctx.makeReviewer wins over ctx.reviewer when both are set.
  if (ctx.makeReviewer) {
    ctx.reviewer = ctx.makeReviewer(plan);
  }

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
    // v0.2 M2 — when the M1.5 freeze produced a prd_runs row for
    // this run AND the caller wired runPrdDispatch, route the
    // EXECUTING phase through the PRD dispatcher. Otherwise fall
    // back to the v0.1 plan-approval + plan-executor path so any
    // caller that did not opt into the PRD flow gets the same
    // behaviour as before.
    const prdRows = listPrdRunsByRunId(ctx.db, ctx.runId);
    const usePrdPath = prdRows.length > 0 && ctx.runPrdDispatch !== undefined;
    usedPrdPath = usePrdPath;
    if (usePrdPath) {
      state = await runPrdDispatchPhase(ctx, prdRows[0]!.id, state);
      if (state === 'ABORTED' || state === 'FAILED') {
        emitFinalMetrics(ctx, state, submittedAtMs, confirmedAtMs, usedPrdPath);
        return { finalState: state };
      }
    } else {
      // Sprint A — explicit plan-approval gate. Auto-skipped when the
      // caller opts in (CLI/test path) or BEAVER_AUTO_APPROVE_PLAN=1.
      state = await runPlanApproval(ctx, plan, state);
      if (state === 'ABORTED' || state === 'FAILED') {
        return { finalState: state };
      }
      state = await runExecuteReview(ctx, plan, state);
    }
  }

  state = await runFinalReview(ctx, state);

  if (state === 'COMPLETED') updateRunStatus(ctx.db, ctx.runId, 'COMPLETED');
  emitFinalMetrics(ctx, state, submittedAtMs, confirmedAtMs, usedPrdPath);
  return { finalState: state };
}

/** v0.2 M4.2 — emit KR2 (confirm → finished latency) and KR5 (regression
 *  flag + final state). Called once per run, on every terminal exit
 *  path. Never throws — recordMetric swallows fs failures. */
function emitFinalMetrics(
  ctx: OrchestratorContext,
  finalState: RunState,
  submittedAtMs: number,
  confirmedAtMs: number | null,
  usedPrdPath: boolean,
): void {
  if (!ctx.repoRoot) return;
  const finishedAtMs = Date.now();
  if (confirmedAtMs !== null) {
    recordMetric(ctx.repoRoot, {
      kr: 'KR2',
      runId: ctx.runId,
      confirmedAtMs,
      finishedAtMs,
      deltaMs: finishedAtMs - confirmedAtMs,
      finalState,
    });
  }
  recordMetric(ctx.repoRoot, {
    kr: 'KR5',
    runId: ctx.runId,
    finalState,
    usedPrdPath,
  });
  // submittedAtMs is logged on KR1; keep the duplicate reference quiet.
  void submittedAtMs;
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
      ...(ctx.parentContext !== undefined ? { parentContext: ctx.parentContext } : {}),
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
      ...(ctx.parentContext !== undefined ? { parentContext: ctx.parentContext } : {}),
    });
    lastRefinement = refinement;

    // v0.2 M1.3b — persist the rendered PRD markdown to
    // <repoRoot>/.beaver/prd-draft.md so the renderer's PRDPane (and
    // any other reader) sees the live refiner output. Best-effort:
    // failures here must not block the run, since the on-disk draft
    // is a UX nicety, not a state-machine prerequisite. Skipped when
    // ctx.repoRoot is unset (test path that does not care about
    // draft persistence stays unaffected).
    if (ctx.repoRoot) {
      void writePrdDraft(ctx.repoRoot, ctx.goal, refinement);
    }

    if (refinement.ready) {
      insertEvent(ctx.db, {
        run_id: ctx.runId,
        ts: now(),
        source: SOURCE,
        type: 'goal.refined',
        payload_json: JSON.stringify({ iteration: i, ready: true }),
      });
      // v0.2 M1.5 — when the refiner self-approves (ready=true) we
      // freeze the draft on its behalf so the PRD ledger and the
      // on-disk prd.md stay consistent with the user-approve path.
      // Skip the freeze for refinements that lack a real PRD object;
      // those are v0.1-style trivial refiners (assumptions empty +
      // no acceptance criteria) and freezing them would activate
      // the PRD dispatcher for a no-op checklist.
      if (ctx.repoRoot && hasRealPrd(refinement)) {
        await tryFreezePrdAndLedger(ctx);
      }
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
      // v0.2 M1.5 — ConfirmGate: freeze the draft to prd.md +
      // PROMPT.md and record one prd_runs row. Best-effort: a
      // freeze failure (missing draft, fs error) does not abort
      // the run, since the FSM still advances to PLANNING and the
      // user can re-confirm via the PRDPane in a follow-up. Same
      // PRD-content gate as the ready=true branch above.
      if (ctx.repoRoot && hasRealPrd(refinement)) {
        await tryFreezePrdAndLedger(ctx);
      }
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
  if (plan.tasks.length === 0) return startState;
  // Phase 2-A — pick the execution mode. Sequential keeps the v0.1.1-A
  // single-worktree path bit-for-bit; parallel uses per-task worktrees
  // with a sequential INTEGRATING merge stage at the end.
  const maxParallel = Math.max(1, ctx.maxParallelTasks ?? DEFAULT_MAX_PARALLEL_TASKS);
  if (maxParallel > 1 && plan.tasks.length > 1) {
    return runExecuteReviewParallel(ctx, plan, startState, { maxParallel });
  }
  return runExecuteReviewSequential(ctx, plan, startState);
}

async function runExecuteReviewSequential(
  ctx: OrchestratorContext,
  plan: Plan,
  startState: RunState,
): Promise<RunState> {
  let state = startState;

  // v0.1.1-A — multi-task plan execution. Run each task in sequence.
  // Phase 1-A: reviewer can return three verdicts:
  //   - accept   → next task (or FINAL_REVIEW_REQUESTED if last)
  //   - retry    → re-dispatch same task, capped at MAX_RETRIES
  //   - escalate → post 'review-escalation' checkpoint, user
  //                 approves to proceed or rejects to FAIL
  //
  // Tasks share one worktree (sequential). Phase 2-A's parallel path
  // takes over when ctx.maxParallelTasks > 1.
  for (let i = 0; i < plan.tasks.length; i += 1) {
    const task = plan.tasks[i]!;
    const isLast = i === plan.tasks.length - 1;

    // review-pass: TASK_DISPATCHED denotes the EXECUTING-entry event
    // for a fresh dispatch. After the first task, REVIEW_DONE already
    // returned us to EXECUTING; firing TASK_DISPATCHED again is a
    // self-loop that pollutes the audit ledger. Skip on subsequent
    // iterations so each task has exactly one dispatch event.
    if (i === 0) {
      state = applyTransition(ctx, state, { type: 'TASK_DISPATCHED' });
    }

    // Inner retry loop — up to MAX_REVIEWER_RETRIES extra attempts
    // when the reviewer says 'retry'. Capped to bound runaway cost.
    let attempt = 0;
    let outcome: 'accept' | 'fail' = 'fail';
    while (attempt <= MAX_REVIEWER_RETRIES) {
      const result = await dispatchTask(ctx, task);
      if (result.status !== 'ok') {
        const next = applyTransition(ctx, state, {
          type: 'FAIL',
          reason: `task-${result.status}: ${result.summary} (task=${task.id})`,
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
        payload_json: JSON.stringify({ taskId: task.id, attempt, ...verdict }),
      });

      if (verdict.verdict === 'accept') {
        outcome = 'accept';
        break;
      }
      if (verdict.verdict === 'retry' && attempt < MAX_REVIEWER_RETRIES) {
        attempt += 1;
        // Loop back into EXECUTING for the retry — REVIEW_DONE drives it.
        state = applyTransition(ctx, state, { type: 'REVIEW_DONE' });
        continue;
      }
      // 'escalate' or 'retry' beyond the cap → post a checkpoint and
      // wait for the user. v0.1: approve/reject decides the run.
      const escalation = await runReviewEscalation(ctx, task.id, verdict);
      if (escalation === 'approve') {
        outcome = 'accept';
        break;
      }
      const next = applyTransition(ctx, state, {
        type: 'FAIL',
        reason: `review-${verdict.verdict}: ${verdict.reason} (task=${task.id})`,
      });
      updateRunStatus(ctx.db, ctx.runId, 'FAILED');
      return next;
    }

    if (outcome !== 'accept') {
      // Belt-and-braces — should never reach here, but guard the FSM.
      const next = applyTransition(ctx, state, {
        type: 'FAIL',
        reason: `review: failed to converge after ${MAX_REVIEWER_RETRIES + 1} attempts (task=${task.id})`,
      });
      updateRunStatus(ctx.db, ctx.runId, 'FAILED');
      return next;
    }

    if (isLast) {
      state = applyTransition(ctx, state, { type: 'FINAL_REVIEW_REQUESTED' });
    } else {
      state = applyTransition(ctx, state, { type: 'REVIEW_DONE' });
    }
  }

  return state;
}

// ---------------------------------------------------------------------------
// Phase 2-A — parallel-worktree execution path.
//
// Concurrency model
//   - Worker pool of size `maxParallel`. Each worker takes the next
//     ready task (one whose `dependsOn` parents have all *integrated*),
//     creates an isolated worktree, runs the executor + reviewer, and
//     enqueues the resulting branch for integration.
//   - A single sequential integrator drains the queue and merges
//     branches into the user's working branch. Conflicts surface as
//     `merge-conflict` checkpoints; `resolve` proceeds, anything else
//     fails the run.
//
// Strict dependsOn
//   A task with deps cannot start until every parent has been merged.
//   This eliminates the "task B reads file X that task A wrote, but A
//   wasn't merged yet" failure mode.

interface ParallelOptions {
  maxParallel: number;
}

interface IntegrateItem {
  task: Task;
  branch: string;
  worktreePath: string;
}

type TaskRunState = 'pending' | 'running' | 'reviewed' | 'integrating' | 'integrated' | 'failed';

async function runExecuteReviewParallel(
  ctx: OrchestratorContext,
  plan: Plan,
  startState: RunState,
  options: ParallelOptions,
): Promise<RunState> {
  let state = startState;
  const repoRoot = ctx.repoRoot ?? process.cwd();
  const worktreesRoot = ctx.worktreesRoot ?? path.join(repoRoot, '.beaver', 'worktrees', ctx.runId);
  await fs.promises.mkdir(worktreesRoot, { recursive: true });

  // FSM-side: a single TASK_DISPATCHED self-loop marks entry into the
  // parallel work block. Per-task dispatch/completion live in the
  // audit ledger (`task.*` events) so the FSM doesn't oscillate.
  state = applyTransition(ctx, state, { type: 'TASK_DISPATCHED' });

  const taskIndex = new Map<string, Task>();
  for (const t of plan.tasks) taskIndex.set(t.id, t);
  const taskState = new Map<string, TaskRunState>();
  for (const t of plan.tasks) taskState.set(t.id, 'pending');

  const integrateQueue: IntegrateItem[] = [];
  let integratorBusy = false;
  let runFailReason: string | null = null;
  let inFlight = 0;

  await new Promise<void>((resolveAll) => {
    const isAllDone = (): boolean => {
      if (integratorBusy) return false;
      if (integrateQueue.length > 0) return false;
      for (const s of taskState.values()) {
        if (s !== 'integrated' && s !== 'failed') return false;
      }
      return true;
    };

    const drainOnFailure = (): void => {
      // After a failure, any reviewed-but-not-integrated tasks need
      // their state collapsed to 'failed' so isAllDone can return.
      // Worktrees are left for manual cleanup; the run is already
      // doomed and we don't want to race git ops with a half-merged
      // working tree.
      if (runFailReason === null) return;
      while (integrateQueue.length > 0) {
        const item = integrateQueue.shift();
        if (item) taskState.set(item.task.id, 'failed');
      }
    };

    const checkDone = (): void => {
      if (runFailReason !== null && inFlight === 0 && !integratorBusy) {
        drainOnFailure();
        resolveAll();
        return;
      }
      if (isAllDone()) resolveAll();
    };

    const pickReadyTasks = (): Task[] => {
      const ready: Task[] = [];
      for (const task of plan.tasks) {
        if (taskState.get(task.id) !== 'pending') continue;
        const deps = task.dependsOn ?? [];
        const allIntegrated = deps.every((d) => taskState.get(d) === 'integrated');
        if (allIntegrated) ready.push(task);
      }
      return ready;
    };

    const tryStartWorkers = (): void => {
      if (runFailReason !== null) {
        checkDone();
        return;
      }
      while (inFlight < options.maxParallel) {
        const ready = pickReadyTasks();
        if (ready.length === 0) break;
        const task = ready[0];
        if (!task) break;
        taskState.set(task.id, 'running');
        inFlight += 1;
        spawnWorker(task);
      }
      checkDone();
    };

    const spawnWorker = (task: Task): void => {
      void (async () => {
        const worktreePath = path.join(worktreesRoot, task.id);
        let branchAllocated: string | null = null;
        try {
          const handle = await createWorktree({
            repoRoot,
            runId: ctx.runId,
            agentId: task.id,
            path: worktreePath,
          });
          branchAllocated = handle.branch;
          insertEvent(ctx.db, {
            run_id: ctx.runId,
            ts: now(),
            source: SOURCE,
            type: 'task.dispatched',
            payload_json: JSON.stringify({
              taskId: task.id,
              branch: handle.branch,
              workdir: worktreePath,
            }),
          });

          // Per-task dispatch + review with the same retry/escalate
          // semantics as the sequential path. Failure modes here mark
          // the task `failed` and trigger run failure.
          const verdict = await runDispatchAndReviewParallel(ctx, task, worktreePath);
          if (verdict.outcome === 'reject') {
            taskState.set(task.id, 'failed');
            runFailReason = runFailReason ?? verdict.reason;
            // Best-effort worktree cleanup so .beaver/ doesn't leak.
            try {
              await removeWorktree({ repoRoot, path: worktreePath, branch: handle.branch });
            } catch {
              /* leave the dir; user can clean up manually */
            }
          } else {
            taskState.set(task.id, 'reviewed');
            integrateQueue.push({ task, branch: handle.branch, worktreePath });
            insertEvent(ctx.db, {
              run_id: ctx.runId,
              ts: now(),
              source: SOURCE,
              type: 'task.completed',
              payload_json: JSON.stringify({ taskId: task.id }),
            });
          }
        } catch (err) {
          taskState.set(task.id, 'failed');
          runFailReason =
            runFailReason ??
            `worker-error (task=${task.id}): ${err instanceof Error ? err.message : String(err)}`;
          if (branchAllocated) {
            try {
              await removeWorktree({ repoRoot, path: worktreePath, branch: branchAllocated });
            } catch {
              /* ignore */
            }
          }
        } finally {
          inFlight -= 1;
          tryStartWorkers();
          void runIntegrator();
        }
      })();
    };

    const runIntegrator = async (): Promise<void> => {
      if (integratorBusy) return;
      if (integrateQueue.length === 0) {
        checkDone();
        return;
      }
      integratorBusy = true;
      try {
        while (integrateQueue.length > 0 && runFailReason === null) {
          const item = integrateQueue.shift();
          if (!item) break;
          taskState.set(item.task.id, 'integrating');
          const merged = await integrateItem(ctx, repoRoot, item);
          if (merged === 'integrated') {
            taskState.set(item.task.id, 'integrated');
          } else {
            taskState.set(item.task.id, 'failed');
            runFailReason = runFailReason ?? `merge-conflict-aborted (task=${item.task.id})`;
          }
        }
      } finally {
        integratorBusy = false;
        // New deps may now be unblocked.
        tryStartWorkers();
        checkDone();
      }
    };

    // Kick off: schedule whatever is initially ready.
    tryStartWorkers();
  });

  if (runFailReason !== null) {
    const next = applyTransition(ctx, state, { type: 'FAIL', reason: runFailReason });
    updateRunStatus(ctx.db, ctx.runId, 'FAILED');
    return next;
  }

  // Phase 2-A — formal INTEGRATING marker. The actual merges happened
  // inline above; this pair of transitions gives the renderer a brief
  // "we're wrapping up" state and keeps the audit ledger explicit.
  state = applyTransition(ctx, state, { type: 'INTEGRATION_STARTED' });
  state = applyTransition(ctx, state, { type: 'INTEGRATION_DONE' });
  return state;
}

interface ParallelTaskOutcome {
  outcome: 'accept' | 'reject';
  reason?: string;
}

async function runDispatchAndReviewParallel(
  ctx: OrchestratorContext,
  task: Task,
  workdir: string,
): Promise<ParallelTaskOutcome> {
  let attempt = 0;
  while (attempt <= MAX_REVIEWER_RETRIES) {
    const result = await dispatchTask(ctx, task, { workdir });
    if (result.status !== 'ok') {
      return { outcome: 'reject', reason: `task-${result.status}: ${result.summary}` };
    }
    const verdict = await reviewResult(ctx, task.id, result);
    insertEvent(ctx.db, {
      run_id: ctx.runId,
      ts: now(),
      source: SOURCE,
      type: 'review.verdict',
      payload_json: JSON.stringify({ taskId: task.id, attempt, ...verdict }),
    });
    if (verdict.verdict === 'accept') return { outcome: 'accept' };
    if (verdict.verdict === 'retry' && attempt < MAX_REVIEWER_RETRIES) {
      attempt += 1;
      continue;
    }
    const escalation = await runReviewEscalation(ctx, task.id, verdict);
    if (escalation === 'approve') return { outcome: 'accept' };
    return { outcome: 'reject', reason: `review-${verdict.verdict}: ${verdict.reason}` };
  }
  return {
    outcome: 'reject',
    reason: `review: failed to converge after ${MAX_REVIEWER_RETRIES + 1} attempts`,
  };
}

async function integrateItem(
  ctx: OrchestratorContext,
  repoRoot: string,
  item: IntegrateItem,
): Promise<'integrated' | 'aborted'> {
  // First merge attempt. If it succeeds, we're done — clean up and
  // emit the audit event. If it fails with conflicts, the user
  // resolves them in the working tree and answers `resolve` to a
  // checkpoint we post.
  const result = await mergeBranchInto({ repoRoot, branch: item.branch });
  if (result.ok) {
    await safeRemoveWorktree(repoRoot, item);
    insertEvent(ctx.db, {
      run_id: ctx.runId,
      ts: now(),
      source: SOURCE,
      type: 'task.integrated',
      payload_json: JSON.stringify({ taskId: item.task.id, branch: item.branch }),
    });
    return 'integrated';
  }

  const checkpointId = `${ctx.runId}:merge-conflict:${item.task.id}`;
  insertCheckpoint(ctx.db, {
    id: checkpointId,
    run_id: ctx.runId,
    kind: MERGE_CONFLICT_KIND,
    status: 'pending',
    prompt: JSON.stringify({
      taskId: item.task.id,
      branch: item.branch,
      conflictedFiles: result.conflictedFiles,
    }),
  });
  const answer = await pollForAnswer(ctx, checkpointId);
  const decision = answer?.trim().toLowerCase();
  if (decision && RESOLVE_RESPONSES.has(decision)) {
    // The user resolved the conflict in the working tree; commit it
    // so the merge is complete, then continue.
    try {
      await runGitInRepo(repoRoot, ['add', '-A']);
      await runGitInRepo(repoRoot, ['commit', '--no-edit']);
    } catch (err) {
      // The user said "resolve" but the working tree still has
      // conflicts (or nothing to commit). Treat as abort to avoid a
      // half-merged state.
      await abortMerge(repoRoot);
      insertEvent(ctx.db, {
        run_id: ctx.runId,
        ts: now(),
        source: SOURCE,
        type: 'task.merge_failed',
        payload_json: JSON.stringify({
          taskId: item.task.id,
          reason: err instanceof Error ? err.message : String(err),
        }),
      });
      return 'aborted';
    }
    await safeRemoveWorktree(repoRoot, item);
    insertEvent(ctx.db, {
      run_id: ctx.runId,
      ts: now(),
      source: SOURCE,
      type: 'task.integrated',
      payload_json: JSON.stringify({
        taskId: item.task.id,
        branch: item.branch,
        viaConflictResolution: true,
      }),
    });
    return 'integrated';
  }

  // Anything other than `resolve` aborts the merge and fails the run.
  await abortMerge(repoRoot);
  return 'aborted';
}

async function safeRemoveWorktree(repoRoot: string, item: IntegrateItem): Promise<void> {
  try {
    await removeWorktree({ repoRoot, path: item.worktreePath, branch: item.branch });
  } catch {
    // Worktree cleanup is best-effort; a dangling .beaver/worktrees/
    // entry is annoying but not run-breaking.
  }
}

function runGitInRepo(cwd: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(`git ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });
}

/** Phase 1-A — reviewer escalation checkpoint. Posts a `review-
 *  escalation` checkpoint with the reviewer's verdict + reason; the
 *  user answers `approve` (proceed despite the reviewer's concern) or
 *  anything else (treated as reject, run FAILS). */
async function runReviewEscalation(
  ctx: OrchestratorContext,
  taskId: string,
  verdict: { verdict: string; reason: string },
): Promise<'approve' | 'reject'> {
  const checkpointId = `${ctx.runId}:review-escalation:${taskId}`;
  insertCheckpoint(ctx.db, {
    id: checkpointId,
    run_id: ctx.runId,
    kind: ESCALATION_KIND,
    status: 'pending',
    prompt: `Reviewer says ${verdict.verdict}: ${verdict.reason}`,
  });
  const answer = await pollForAnswer(ctx, checkpointId);
  if (answer && APPROVE_RESPONSES.has(answer.trim().toLowerCase())) return 'approve';
  return 'reject';
}

/** Phase 1-A — cap on automatic reviewer retries before posting an
 *  escalation checkpoint. The reviewer is sometimes too cautious;
 *  this prevents runaway cost while still giving the agent a chance
 *  to fix a mechanical mistake. */
const MAX_REVIEWER_RETRIES = 1;

async function runFinalReview(ctx: OrchestratorContext, startState: RunState): Promise<RunState> {
  if (startState !== 'FINAL_REVIEW_PENDING') return startState;
  const checkpointId = `${ctx.runId}:final-review`;
  const basePrompt = ctx.finalReviewPrompt ?? `Approve completion for goal: ${ctx.goal}`;
  const prompt = await prependWikiHint(ctx, FINAL_REVIEW_KIND, { goal: ctx.goal }, basePrompt);
  insertCheckpoint(ctx.db, {
    id: checkpointId,
    run_id: ctx.runId,
    kind: FINAL_REVIEW_KIND,
    status: 'pending',
    prompt,
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

/**
 * Sprint A — drive PLANNING → EXECUTING via an explicit plan-approval
 * checkpoint.
 *
 * Auto-skip path: when `ctx.autoApprovePlan === true` OR the env
 * `BEAVER_AUTO_APPROVE_PLAN=1` is set, the orchestrator fires
 * PLAN_APPROVED directly and returns. This is the legacy programmatic
 * path used by tests and the convenience API; production CLI/desktop
 * leaves it false so the renderer can show an Approve button.
 *
 * Otherwise: post a `plan-approval` checkpoint with a human-readable
 * plan summary, block on `waitForAnswer`, then route the response:
 *   - approve / yes        → PLAN_APPROVED → EXECUTING
 *   - anything else (reject, comment, timeout) → ABORT
 *
 * Wait timeout defaults to 30 min so a brief `pollTimeoutMs` (e.g.
 * 30 s) used for internal poll cadence doesn't kill a run while a
 * human is reading the plan.
 */
async function runPlanApproval(
  ctx: OrchestratorContext,
  plan: Plan,
  startState: RunState,
): Promise<RunState> {
  const autoApproved =
    ctx.autoApprovePlan === true || process.env['BEAVER_AUTO_APPROVE_PLAN'] === '1';
  if (autoApproved) {
    return applyTransition(ctx, startState, { type: 'PLAN_APPROVED' });
  }

  const checkpointId = `${ctx.runId}:plan-approval`;
  const summary = renderPlanSummary(plan);
  const prompt = await prependWikiHint(
    ctx,
    PLAN_APPROVAL_KIND,
    { goal: ctx.goal, taskCount: plan.tasks.length },
    summary,
  );
  insertCheckpoint(ctx.db, {
    id: checkpointId,
    run_id: ctx.runId,
    kind: PLAN_APPROVAL_KIND,
    status: 'pending',
    prompt,
  });

  const planApprovalTimeoutMs = ctx.planApprovalTimeoutMs ?? 30 * 60 * 1000;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), planApprovalTimeoutMs);
  let response: string;
  try {
    response = await waitForAnswer(ctx.db, checkpointId, {
      pollMs: ctx.pollIntervalMs ?? 200,
      signal: ac.signal,
    });
  } catch (err) {
    const next = applyTransition(ctx, startState, {
      type: 'ABORT',
      reason: ac.signal.aborted
        ? `plan-approval: not answered within ${planApprovalTimeoutMs} ms`
        : `plan-approval: ${err instanceof Error ? err.message : String(err)}`,
    });
    updateRunStatus(ctx.db, ctx.runId, 'ABORTED');
    return next;
  } finally {
    clearTimeout(timer);
  }

  const decision = response.trim().toLowerCase();
  if (APPROVE_RESPONSES.has(decision)) {
    insertEvent(ctx.db, {
      run_id: ctx.runId,
      ts: now(),
      source: SOURCE,
      type: 'plan.approved',
      payload_json: JSON.stringify({ taskCount: plan.tasks.length }),
    });
    return applyTransition(ctx, startState, { type: 'PLAN_APPROVED' });
  }
  // reject / comment / anything-else → ABORT. v0.1: comments don't loop
  // back into the planner; the user starts a follow-up run with the
  // amendment baked into the next goal.
  insertEvent(ctx.db, {
    run_id: ctx.runId,
    ts: now(),
    source: SOURCE,
    type: 'plan.rejected',
    payload_json: JSON.stringify({ response: response.slice(0, 500) }),
  });
  const next = applyTransition(ctx, startState, {
    type: 'ABORT',
    reason: `plan-approval: ${response}`,
  });
  updateRunStatus(ctx.db, ctx.runId, 'ABORTED');
  return next;
}

/** Render a human-readable plan summary for the plan-approval prompt.
 *  Capped at the first 20 tasks to keep the checkpoint card readable;
 *  the full plan-v1.json is on disk under `<runsRoot>/<runId>/plan/`. */
function renderPlanSummary(plan: Plan): string {
  const head = `Plan ready for approval.\n\nGoal: ${plan.goal}\n\nTasks (${plan.tasks.length}):`;
  const MAX_TASKS_SHOWN = 20;
  const shown = plan.tasks.slice(0, MAX_TASKS_SHOWN);
  const lines = shown.map((t, i) => {
    const deps = (t.dependsOn ?? []).length > 0 ? ` ← ${(t.dependsOn ?? []).join(', ')}` : '';
    const goal = t.goal.length > 80 ? `${t.goal.slice(0, 77)}…` : t.goal;
    return `  ${i + 1}. [${t.role}] ${t.id}: ${goal}${deps}`;
  });
  const tail =
    plan.tasks.length > MAX_TASKS_SHOWN
      ? `\n\n…and ${plan.tasks.length - MAX_TASKS_SHOWN} more (full plan in plan-v1.json)`
      : '';
  return `${head}\n${lines.join('\n')}${tail}`;
}

/** Sprint C — best-effort wiki hint prepend.
 *
 *  When `ctx.wikiQuery` is set, calls it with `(kind, context)`,
 *  formats any returned hint as a leading `[hint] …` line on the
 *  prompt, and lists source pages so users can verify. Failures
 *  swallow silently — a flaky wiki must never block a checkpoint.
 */
async function prependWikiHint(
  ctx: OrchestratorContext,
  kind: string,
  context: Record<string, unknown>,
  basePrompt: string,
): Promise<string> {
  if (!ctx.wikiQuery) return basePrompt;
  try {
    const result = await ctx.wikiQuery(kind, context);
    if (!result.hint) return basePrompt;
    const sources =
      result.sourcePages.length > 0 ? `\n[hint sources] ${result.sourcePages.join(', ')}` : '';
    return `[hint] ${result.hint}${sources}\n\n${basePrompt}`;
  } catch {
    // Wiki is informational; never let it break a checkpoint.
    return basePrompt;
  }
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

/** v0.2 M1.5 gate — only treat a refinement as PRD-grade when the
 *  refiner produced a real `prd` object with at least one user story
 *  carrying acceptance criteria. v0.1-style refiners that just flip
 *  ready=true without structure stay on the legacy plan path so
 *  existing callers see no behaviour change. */
function hasRealPrd(refinement: RefinementResult): boolean {
  const prd = refinement.prd;
  if (!prd) return false;
  if (!prd.userStories || prd.userStories.length === 0) return false;
  return prd.userStories.some(
    (s) => Array.isArray(s.acceptanceCriteria) && s.acceptanceCriteria.length > 0,
  );
}

/** v0.2 M2 — drive the EXECUTING phase via the PRD dispatcher.
 *  Called instead of runExecuteReview when a prd_runs row exists
 *  AND ctx.runPrdDispatch was wired by api.ts. Maps the dispatcher's
 *  pass/fail outcome onto the FSM the same way the legacy path
 *  does: PLAN_APPROVED → EXECUTING → … → FINAL_REVIEW_REQUESTED
 *  (or FAIL on any task failure past its retry cap). */
async function runPrdDispatchPhase(
  ctx: OrchestratorContext,
  prdRunId: string,
  startState: RunState,
): Promise<RunState> {
  if (!ctx.runPrdDispatch || !ctx.repoRoot) return startState;
  let state = applyTransition(ctx, startState, { type: 'PLAN_APPROVED' });
  state = applyTransition(ctx, state, { type: 'TASK_DISPATCHED' });
  let result: DispatchResult;
  try {
    result = await ctx.runPrdDispatch(prdRunId, ctx.repoRoot);
  } catch (err) {
    const next = applyTransition(ctx, state, {
      type: 'FAIL',
      reason: `prd-dispatch: ${err instanceof Error ? err.message : String(err)}`,
    });
    updateRunStatus(ctx.db, ctx.runId, 'FAILED');
    return next;
  }
  if (result.failed > 0) {
    const next = applyTransition(ctx, state, {
      type: 'FAIL',
      reason: `prd-dispatch: ${result.failed} task(s) failed past retry cap`,
    });
    updateRunStatus(ctx.db, ctx.runId, 'FAILED');
    return next;
  }
  // Mirror the v0.1 sequential path's "TASK_COMPLETED → REVIEWING →
  // FINAL_REVIEW_REQUESTED" tail so the audit ledger looks the same
  // shape regardless of which dispatcher ran.
  state = applyTransition(ctx, state, { type: 'TASK_COMPLETED' });
  state = applyTransition(ctx, state, { type: 'FINAL_REVIEW_REQUESTED' });
  return state;
}

/** v0.2 M1.5 — freeze prd-draft.md to prd.md + PROMPT.md and insert
 *  a prd_runs ledger row. Best-effort: a freeze failure (missing
 *  draft, fs error, DB conflict) is recorded as a `prd.freeze_failed`
 *  event but does not abort the run. The FSM still advances; the
 *  user can re-confirm via the PRDPane in a follow-up. */
async function tryFreezePrdAndLedger(ctx: OrchestratorContext): Promise<void> {
  if (!ctx.repoRoot) return;
  try {
    const result = await freezePrd({ repoRoot: ctx.repoRoot });
    insertPrdRun(ctx.db, {
      id: result.id,
      run_id: ctx.runId,
      frozen_at: result.frozenAt,
      prd_path: result.prdPath,
      prompt_path: result.promptPath,
    });
    insertEvent(ctx.db, {
      run_id: ctx.runId,
      ts: now(),
      source: SOURCE,
      type: 'prd.frozen',
      payload_json: JSON.stringify({
        prdRunId: result.id,
        prdPath: result.prdPath,
        promptPath: result.promptPath,
      }),
    });
  } catch (err) {
    insertEvent(ctx.db, {
      run_id: ctx.runId,
      ts: now(),
      source: SOURCE,
      type: 'prd.freeze_failed',
      payload_json: JSON.stringify({
        reason: err instanceof Error ? err.message : String(err),
      }),
    });
  }
}

/** v0.2 M1.3b — write the rendered PRD markdown to
 *  `<repoRoot>/.beaver/prd-draft.md`. Best-effort: any error is
 *  swallowed because the draft is a UX surface, not part of the FSM
 *  contract. Creates `.beaver/` if missing.
 */
async function writePrdDraft(
  repoRoot: string,
  rawGoal: string,
  refinement: RefinementResult,
): Promise<void> {
  try {
    const beaverDir = path.join(repoRoot, '.beaver');
    await fs.promises.mkdir(beaverDir, { recursive: true });
    const draftPath = path.join(beaverDir, 'prd-draft.md');
    const markdown = renderRefinementAsMarkdown(refinement, rawGoal);
    await fs.promises.writeFile(draftPath, markdown, 'utf8');
  } catch {
    // Drafting is best-effort. The orchestrator continues regardless.
  }
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

async function dispatchTask(
  ctx: OrchestratorContext,
  task: Task,
  opts?: { workdir?: string },
): Promise<RunResult> {
  if (!ctx.executor) {
    throw new Error(`runOrchestrator: plan has tasks but no executor was provided`);
  }
  return opts ? ctx.executor(task, opts) : ctx.executor(task);
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
