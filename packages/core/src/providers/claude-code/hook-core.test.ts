// In-process tests for runHook. Spawn-based E2E lives in hook.test.ts.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { listEventsByRun } from '../../workspace/dao/events.js';
import { answerCheckpoint, listPendingCheckpoints } from '../../workspace/dao/checkpoints.js';
import { insertProject } from '../../workspace/dao/projects.js';
import { insertRun } from '../../workspace/dao/runs.js';
import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';

import { runHook } from './hook-core.js';

let tmpDir: string;
let dbPath: string;
let db: Db;

const ENV = {
  dbPath: '',
  runId: 'r1',
  worktree: '/repo/.beaver/worktrees/agent-1',
  cwd: '/repo/.beaver/worktrees/agent-1',
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-hook-core-'));
  dbPath = path.join(tmpDir, 'beaver.db');
  ENV.dbPath = dbPath;
  db = openDb({ path: dbPath });
  runMigrations(db);
  insertProject(db, {
    id: 'p1',
    name: 'p',
    root_path: '/repo',
    created_at: '2026-04-27T00:00:00Z',
  });
  insertRun(db, {
    id: 'r1',
    project_id: 'p1',
    goal: 'g',
    status: 'RUNNING',
    started_at: '2026-04-27T00:00:00Z',
    budget_usd: 20,
  });
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runHook — verdict-driven exit codes and event writes', () => {
  it('allows pytest with exit 0 + writes agent.shell.classify event', async () => {
    const r = await runHook({ input: { tool: 'shell', input: { command: 'pytest' } }, env: ENV });
    expect(r.exitCode).toBe(0);

    const events = listEventsByRun(db, 'r1');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('agent.shell.classify');
  });

  it('hard-denies rm -rf / with exit 2 + writes agent.shell.denied event', async () => {
    const r = await runHook({
      input: { tool: 'shell', input: { command: 'rm -rf /' } },
      env: ENV,
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/hard-deny/);

    const events = listEventsByRun(db, 'r1');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('agent.shell.denied');
  });

  it('require-confirmation: writes checkpoint, returns based on answer (approve)', async () => {
    const promise = runHook({
      input: { tool: 'shell', input: { command: 'npm install bcrypt' } },
      env: ENV,
      pollIntervalMs: 50,
    });

    // Wait for the checkpoint row to land, then answer.
    const start = Date.now();
    while (Date.now() - start < 2_000) {
      const pending = listPendingCheckpoints(db, 'r1');
      if (pending.length > 0) {
        answerCheckpoint(db, pending[0]!.id, 'approve');
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    const r = await promise;
    expect(r.exitCode).toBe(0);
    expect(r.checkpointId).toBeDefined();
  });

  it('require-confirmation: rejected response yields exit 2', async () => {
    const promise = runHook({
      input: { tool: 'shell', input: { command: 'npm install bcrypt' } },
      env: ENV,
      pollIntervalMs: 50,
    });

    const start = Date.now();
    while (Date.now() - start < 2_000) {
      const pending = listPendingCheckpoints(db, 'r1');
      if (pending.length > 0) {
        answerCheckpoint(db, pending[0]!.id, 'reject');
        break;
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    const r = await promise;
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/rejected/);
  });

  it('fail-closed: returns exit 2 when the db cannot be opened', async () => {
    const r = await runHook({
      input: { tool: 'shell', input: { command: 'pytest' } },
      env: { ...ENV, dbPath: path.join(tmpDir, 'no-such-dir', 'no.db') },
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/cannot open db/);
  });
});

describe('runHook — bug test: 100 allowed shell calls latency', () => {
  it('p95 latency stays under 50 ms in-process', async () => {
    const latencies: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t = Date.now();
      const r = await runHook({
        input: { tool: 'shell', input: { command: 'pytest' } },
        env: ENV,
      });
      latencies.push(Date.now() - t);
      expect(r.exitCode).toBe(0);
    }
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
    // The spec target is the in-process classify+DB-write path; subprocess
    // spawn cost is a separate concern that lives in hook.test.ts.
    expect(p95).toBeLessThan(50);
  }, 30_000);
});
