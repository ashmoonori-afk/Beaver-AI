import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
