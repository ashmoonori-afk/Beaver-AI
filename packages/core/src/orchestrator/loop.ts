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

import { transition, type RunState } from './fsm.js';

const SOURCE = 'orchestrator';
const FINAL_REVIEW_KIND = 'final-review';
const APPROVE_RESPONSES = new Set(['approve', 'approved', 'yes']);

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

  state = enterPlanning(ctx, state, runsRoot);

  if (ctx.plan.tasks.length === 0) {
    state = applyTransition(ctx, state, { type: 'FINAL_REVIEW_REQUESTED' });
  } else {
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

async function runExecuteReview(ctx: OrchestratorContext, startState: RunState): Promise<RunState> {
  let state = startState;
  const task = ctx.plan.tasks[0];
  if (!task) return state;

  state = applyTransition(ctx, state, { type: 'TASK_DISPATCHED' });
  const result = await dispatchTask(ctx, task);
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
    payload_json: JSON.stringify({ from, to, event: event.type }),
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
