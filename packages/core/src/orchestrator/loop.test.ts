import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Plan, Task } from '../plan/schema.js';
import type { RunResult } from '../types/provider.js';
import { closeDb, openDb, type Db } from '../workspace/db.js';
import { runMigrations } from '../workspace/migrate.js';
import { answerCheckpoint, getCheckpoint } from '../workspace/dao/checkpoints.js';
import { listEventsByRun, listEventsByType } from '../workspace/dao/events.js';
import { getRun } from '../workspace/dao/runs.js';

import { runOrchestrator } from './loop.js';
import { transition, type RunState } from './fsm.js';

let db: Db;
let workdir: string;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  db.exec(
    "INSERT INTO projects (id, name, root_path, created_at) VALUES ('p1', 'p', '/', '2026-04-27T00:00:00Z')",
  );
  db.exec(
    "INSERT INTO runs (id, project_id, goal, status, started_at, budget_usd) VALUES ('r1', 'p1', 'g', 'INITIALIZED', '2026-04-27T00:00:00Z', 20)",
  );
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-orch-loop-'));
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(workdir, { recursive: true, force: true });
});

function task(id: string): Task {
  return {
    id,
    role: 'coder',
    goal: 'g',
    prompt: 'do',
    dependsOn: [],
    acceptanceCriteria: ['compiles'],
    capabilitiesNeeded: [],
  };
}

function plan(tasks: Task[]): Plan {
  return {
    version: 1,
    goal: 'build',
    tasks,
    createdAt: '2026-04-27T00:00:00Z',
  };
}

function okResult(): RunResult {
  return {
    status: 'ok',
    summary: 'done',
    artifacts: [],
    usage: { tokensIn: 1, tokensOut: 1, model: 'm' },
    rawTranscriptPath: '/tmp/x',
  };
}

function failedResult(): RunResult {
  return {
    ...okResult(),
    status: 'failed',
    summary: 'adapter failed before producing output',
  };
}

async function approveSoon(checkpointId: string): Promise<void> {
  // Wait briefly so the orchestrator has inserted the checkpoint, then approve.
  await new Promise((r) => setTimeout(r, 50));
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (getCheckpoint(db, checkpointId)) {
      answerCheckpoint(db, checkpointId, 'approve');
      return;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('approveSoon: checkpoint never appeared');
}

describe('runOrchestrator — empty plan', () => {
  it('PLANNING -> FINAL_REVIEW_PENDING -> COMPLETED after approve', async () => {
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: plan([]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
    };

    const approval = approveSoon('r1:final-review');
    const [result] = await Promise.all([runOrchestrator(ctx), approval]);

    expect(result.finalState).toBe('COMPLETED');
    expect(getRun(db, 'r1')?.status).toBe('COMPLETED');

    const states = listEventsByType(db, 'r1', 'state.transition').map(
      (e) => JSON.parse(e.payload_json ?? '{}') as { from: string; to: string },
    );
    const sequence = states.map((s) => s.to);
    expect(sequence).toEqual(['PLANNING', 'FINAL_REVIEW_PENDING', 'COMPLETED']);
  });

  it('writes plan-v1.json under runs/<runId>/plan/', async () => {
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: plan([]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
    };
    const approval = approveSoon('r1:final-review');
    await Promise.all([runOrchestrator(ctx), approval]);

    const planPath = path.join(workdir, 'r1', 'plan', 'plan-v1.json');
    expect(fs.existsSync(planPath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(planPath, 'utf8')) as Plan;
    expect(parsed.version).toBe(1);
  });
});

describe('runOrchestrator — single-task plan', () => {
  it('drives planner -> executor -> reviewer -> final-review and writes transitions', async () => {
    const calls: string[] = [];
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: plan([task('t1')]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (t: Task): Promise<RunResult> => {
        calls.push(`exec:${t.id}`);
        return okResult();
      },
    };

    const approval = approveSoon('r1:final-review');
    const [result] = await Promise.all([runOrchestrator(ctx), approval]);

    expect(result.finalState).toBe('COMPLETED');
    expect(calls).toEqual(['exec:t1']);

    const sequence = listEventsByType(db, 'r1', 'state.transition')
      .map((e) => JSON.parse(e.payload_json ?? '{}') as { to: string })
      .map((e) => e.to);
    expect(sequence).toEqual([
      'PLANNING',
      'EXECUTING',
      'EXECUTING', // TASK_DISPATCHED self-loop
      'REVIEWING',
      'FINAL_REVIEW_PENDING',
      'COMPLETED',
    ]);

    const verdicts = listEventsByType(db, 'r1', 'review.verdict');
    expect(verdicts.length).toBe(1);
  });

  it('fails before review when the executor returns a non-ok status', async () => {
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: plan([task('t1')]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 200,
      executor: async (): Promise<RunResult> => failedResult(),
    };

    const result = await runOrchestrator(ctx);

    expect(result.finalState).toBe('FAILED');
    expect(getRun(db, 'r1')?.status).toBe('FAILED');
    expect(listEventsByType(db, 'r1', 'review.verdict')).toHaveLength(0);
  });
});

describe('runOrchestrator — handoff validation (Phase 7.3)', () => {
  it('FAILS the run + posts an escalation checkpoint when role/provider mismatches', async () => {
    const badPlan: Plan = {
      version: 1,
      goal: 'build',
      createdAt: '2026-04-27T00:00:00Z',
      tasks: [
        {
          ...task('t1'),
          role: 'planner',
          providerHint: 'codex',
        },
      ],
    };
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: badPlan,
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
    };
    const result = await runOrchestrator(ctx);
    expect(result.finalState).toBe('FAILED');
    expect(getRun(db, 'r1')?.status).toBe('FAILED');
    expect(getCheckpoint(db, 'r1:handoff-escalation')?.kind).toBe('escalation');
    expect(listEventsByType(db, 'r1', 'handoff.failed')).toHaveLength(1);
  });

  it('FAILS the run when budgetUsd sum exceeds runCapUsd', async () => {
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: plan([
        { ...task('t1'), budgetUsd: 12 },
        { ...task('t2'), budgetUsd: 12 },
      ]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      runCapUsd: 20,
      executor: async (): Promise<RunResult> => okResult(),
    };
    const result = await runOrchestrator(ctx);
    expect(result.finalState).toBe('FAILED');
    expect(getCheckpoint(db, 'r1:handoff-escalation')).not.toBeNull();
    const events = listEventsByType(db, 'r1', 'handoff.failed');
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0]?.payload_json ?? '{}') as {
      errors: Array<{ validator: string }>;
    };
    expect(payload.errors.some((e) => e.validator === 'budget-sum')).toBe(true);
  });

  it('FAILS the run on a dependency cycle (defensive even when PlanSchema accepted it)', async () => {
    // Construct a cyclic plan directly (skipping PlanSchema parse) to
    // prove the orchestrator's pre-dispatch check is independent.
    const cyclicPlan = {
      version: 1,
      goal: 'build',
      createdAt: '2026-04-27T00:00:00Z',
      tasks: [
        { ...task('a'), dependsOn: ['b'] },
        { ...task('b'), dependsOn: ['a'] },
      ],
    };
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: cyclicPlan,
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
    };
    const result = await runOrchestrator(ctx);
    expect(result.finalState).toBe('FAILED');
    const events = listEventsByType(db, 'r1', 'handoff.failed');
    const payload = JSON.parse(events[0]?.payload_json ?? '{}') as {
      errors: Array<{ validator: string }>;
    };
    expect(payload.errors.some((e) => e.validator === 'no-dependency-cycle')).toBe(true);
  });

  it('skipHandoffValidation=true bypasses the validator', async () => {
    // Same bad plan, but the test injects skipHandoffValidation so
    // existing tests with intentional shapes still run end-to-end.
    const badPlan: Plan = {
      version: 1,
      goal: 'build',
      createdAt: '2026-04-27T00:00:00Z',
      tasks: [{ ...task('t1'), role: 'planner', providerHint: 'codex' }],
    };
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: badPlan,
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
      skipHandoffValidation: true,
    };
    const approval = approveSoon('r1:final-review');
    const [result] = await Promise.all([runOrchestrator(ctx), approval]);
    expect(result.finalState).toBe('COMPLETED');
    expect(getCheckpoint(db, 'r1:handoff-escalation')).toBeNull();
  });
});

describe('runOrchestrator — refinement loop (W.11)', () => {
  function readyRefinement(rawGoal: string) {
    return {
      enrichedGoal: `enriched: ${rawGoal}`,
      assumptions: [],
      questions: [],
      ready: true,
    };
  }

  function unreadyRefinement(rawGoal: string, iteration: number) {
    return {
      enrichedGoal: `iter-${iteration}: ${rawGoal}`,
      assumptions: ['single-user'],
      questions: [],
      clarifyingQuestions: [
        {
          id: 'Q1',
          text: 'Auth?',
          options: [
            { label: 'A', value: 'email' },
            { label: 'B', value: 'none' },
          ],
        },
      ],
      ready: false,
    };
  }

  it('skips refinement when ctx.refiner is omitted (backward compat)', async () => {
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: plan([task('t1')]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
    };
    const approval = approveSoon('r1:final-review');
    const [result] = await Promise.all([runOrchestrator(ctx), approval]);
    expect(result.finalState).toBe('COMPLETED');
    // No goal-refinement checkpoint was posted.
    expect(getCheckpoint(db, 'r1:goal-refinement:0')).toBeNull();
  });

  it('auto-advances to PLANNING when refiner returns ready=true (no checkpoint)', async () => {
    const refiner = vi.fn(async ({ rawGoal }: { rawGoal: string }) => readyRefinement(rawGoal));
    const ctx = {
      db,
      runId: 'r1',
      goal: 'build a todo app',
      plan: plan([task('t1')]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
      refiner,
    };
    const approval = approveSoon('r1:final-review');
    const [result] = await Promise.all([runOrchestrator(ctx), approval]);
    expect(result.finalState).toBe('COMPLETED');
    expect(refiner).toHaveBeenCalledTimes(1);
    expect(getCheckpoint(db, 'r1:goal-refinement:0')).toBeNull();
    // The goal.refined event was emitted with ready=true.
    const events = listEventsByType(db, 'r1', 'goal.refined');
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0]?.payload_json ?? '{}') as { ready: boolean };
    expect(payload.ready).toBe(true);
  });

  it('posts a goal-refinement checkpoint and re-calls refiner with section edits on comment', async () => {
    let calls = 0;
    const refiner = vi.fn(
      async ({
        rawGoal,
        sectionEdits,
      }: {
        rawGoal: string;
        sectionEdits?: Record<string, string>;
      }) => {
        calls += 1;
        // First call returns unready; second call (after comment) returns ready.
        if (calls === 1) return unreadyRefinement(rawGoal, 0);
        // Verify the comment was parsed into a section edit.
        expect(sectionEdits).toBeDefined();
        expect(sectionEdits!['prd:goals']).toContain('add latency');
        return readyRefinement(rawGoal);
      },
    );
    const ctx = {
      db,
      runId: 'r1',
      goal: 'todo app',
      plan: plan([task('t1')]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
      refiner,
    };
    // Wait for the first refinement checkpoint, send a section-targeted comment.
    const refineComment = (async () => {
      await new Promise((r) => setTimeout(r, 50));
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        if (getCheckpoint(db, 'r1:goal-refinement:0')) {
          answerCheckpoint(db, 'r1:goal-refinement:0', 'comment:[prd:goals] add latency budget');
          return;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error('refinement checkpoint never appeared');
    })();
    const approval = approveSoon('r1:final-review');
    const [result] = await Promise.all([runOrchestrator(ctx), refineComment, approval]);
    expect(result.finalState).toBe('COMPLETED');
    expect(refiner).toHaveBeenCalledTimes(2);
    // The first goal-refinement checkpoint was answered (status moved off pending).
    expect(getCheckpoint(db, 'r1:goal-refinement:0')?.status).toBe('answered');
  });

  it('FAILS the run cleanly when the user rejects refinement', async () => {
    const refiner = vi.fn(async ({ rawGoal }: { rawGoal: string }) =>
      unreadyRefinement(rawGoal, 0),
    );
    const ctx = {
      db,
      runId: 'r1',
      goal: 'todo app',
      plan: plan([task('t1')]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
      refiner,
    };
    const reject = (async () => {
      await new Promise((r) => setTimeout(r, 50));
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        if (getCheckpoint(db, 'r1:goal-refinement:0')) {
          answerCheckpoint(db, 'r1:goal-refinement:0', 'reject');
          return;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error('refinement checkpoint never appeared');
    })();
    const [result] = await Promise.all([runOrchestrator(ctx), reject]);
    expect(result.finalState).toBe('FAILED');
    expect(getRun(db, 'r1')?.status).toBe('FAILED');
    expect(refiner).toHaveBeenCalledTimes(1);
  });

  it('caps iterations at MAX_REFINEMENT_ITERATIONS and falls through to PLANNING', async () => {
    const refiner = vi.fn(async ({ rawGoal }: { rawGoal: string }) =>
      unreadyRefinement(rawGoal, 0),
    );
    const ctx = {
      db,
      runId: 'r1',
      goal: 'todo app',
      plan: plan([task('t1')]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
      refiner,
    };
    // Comment three times in a row — never approve, never reject.
    const commentLoop = (async () => {
      for (let i = 0; i < 3; i += 1) {
        const id = `r1:goal-refinement:${i}`;
        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
          if (getCheckpoint(db, id)) {
            answerCheckpoint(db, id, `comment:[prd:goals] iteration ${i}`);
            break;
          }
          await new Promise((r) => setTimeout(r, 25));
        }
      }
    })();
    const approval = approveSoon('r1:final-review');
    const [result] = await Promise.all([runOrchestrator(ctx), commentLoop, approval]);
    expect(result.finalState).toBe('COMPLETED');
    // Refiner called exactly MAX (3) times.
    expect(refiner).toHaveBeenCalledTimes(3);
    // Audit log records the cap-out.
    const events = listEventsByType(db, 'r1', 'goal.refined');
    const last = events.at(-1);
    const payload = JSON.parse(last?.payload_json ?? '{}') as { decision?: string };
    expect(payload.decision).toBe('iteration-cap');
  });
});

describe('runOrchestrator — crash + replay rebuilds FSM state', () => {
  it('replaying state.transition events reconstructs the last state', async () => {
    // Drive a happy run to completion, then prove that replaying the
    // persisted state.transition events rebuilds the same final state via
    // the same `transition` function the loop uses.
    const ctx = {
      db,
      runId: 'r1',
      goal: 'g',
      plan: plan([task('t1')]),
      runsRoot: workdir,
      pollIntervalMs: 25,
      pollTimeoutMs: 5_000,
      executor: async (): Promise<RunResult> => okResult(),
    };
    const approval = approveSoon('r1:final-review');
    await Promise.all([runOrchestrator(ctx), approval]);

    const all = listEventsByRun(db, 'r1').filter((e) => e.type === 'state.transition');
    expect(all.length).toBeGreaterThan(0);

    let state: RunState = 'INITIALIZED';
    for (const row of all) {
      const ev = JSON.parse(row.payload_json ?? '{}') as {
        from: RunState;
        to: RunState;
        event: string;
      };
      // Reapply the same event via the FSM; it must yield the recorded `to`.
      // For FAIL/ABORT we synthesize the reason — the loop's payload omits it.
      const payload =
        ev.event === 'FAIL' || ev.event === 'ABORT'
          ? { type: ev.event as 'FAIL' | 'ABORT', reason: 'replay' }
          : { type: ev.event as Exclude<string, 'FAIL' | 'ABORT'> };
      const replayed = transition(state, payload as Parameters<typeof transition>[1]);
      expect(replayed).toBe(ev.to);
      state = replayed;
    }
    expect(state).toBe('COMPLETED');
  });
});
