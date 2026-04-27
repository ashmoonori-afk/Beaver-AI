// runAgent integration tests via the real ClaudeCodeAdapter + mock CLI.
// We exercise the happy path, the stall watchdog (using a tiny stallThresholdMs
// against the claude-stall.json fixture), and confirm the singleton watchdog
// tears down between runs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClaudeCodeAdapter } from '../providers/claude-code/adapter.js';
import { listEventsByRun, listEventsByType } from '../workspace/dao/events.js';
import { insertProject } from '../workspace/dao/projects.js';
import { insertRate } from '../workspace/dao/rate_table.js';
import { insertRun } from '../workspace/dao/runs.js';
import { closeDb, openDb, type Db } from '../workspace/db.js';
import { runMigrations } from '../workspace/migrate.js';

import { runAgent } from './lifecycle.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', 'providers', '_test', 'mock-cli.js');
const FX_DIR = path.join(HERE, '..', 'providers', '_test', 'fixtures');
const fx = (name: string): string => path.join(FX_DIR, name);

let db: Db;
let workdirRoot: string;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  insertProject(db, { id: 'p1', name: 'p', root_path: '/', created_at: '2026-04-27' });
  insertRun(db, {
    id: 'r1',
    project_id: 'p1',
    goal: 'g',
    status: 'RUNNING',
    started_at: '2026-04-27',
    budget_usd: 5,
  });
  insertRate(db, {
    provider: 'claude-code',
    model: 'test-model',
    tokens_in_per_usd: 1000,
    tokens_out_per_usd: 1000,
    effective_from: '2026-01-01T00:00:00Z',
  });
  workdirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-lifecycle-'));
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(workdirRoot, { recursive: true, force: true });
});

function mkAdapter(fixturePath: string): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter({
    cliPath: process.execPath,
    defaultArgs: [MOCK_CLI, fixturePath],
    db,
  });
}

describe('runAgent — happy path', () => {
  it('returns the adapter result and writes spawned + completed events', async () => {
    const result = await runAgent({
      adapter: mkAdapter(fx('claude-normal.json')),
      db,
      runId: 'r1',
      agentId: 'agent-happy',
      role: 'coder',
      runOptions: { prompt: 'do the thing', workdir: workdirRoot },
    });

    expect(result.status).toBe('ok');
    expect(result.usage.tokensIn).toBe(80);

    const spawned = listEventsByType(db, 'r1', 'agent.spawned');
    const completed = listEventsByType(db, 'r1', 'agent.completed');
    expect(spawned).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect(spawned[0]?.source).toBe('agent-happy');
    expect(completed[0]?.source).toBe('agent-happy');
    // Spawned recorded role + provider + thresholds.
    const spawnedPayload = JSON.parse(spawned[0]?.payload_json ?? '{}') as {
      role: string;
      provider: string;
    };
    expect(spawnedPayload.role).toBe('coder');
    expect(spawnedPayload.provider).toBe('claude-code');
    // No stall or timeout event when the run is healthy.
    expect(listEventsByType(db, 'r1', 'agent.stalled')).toHaveLength(0);
    expect(listEventsByType(db, 'r1', 'agent.timed_out')).toHaveLength(0);
  });

  it('forwards adapter events to the caller-supplied onEvent', async () => {
    const seen: string[] = [];
    await runAgent({
      adapter: mkAdapter(fx('claude-normal.json')),
      db,
      runId: 'r1',
      agentId: 'agent-onevent',
      role: 'planner',
      runOptions: {
        prompt: 'p',
        workdir: workdirRoot,
        onEvent: (e) => seen.push(e.type),
      },
    });
    expect(seen.length).toBeGreaterThan(0);
  });
});

describe('runAgent — stall watchdog', () => {
  it('aborts the adapter and writes agent.stalled when no events arrive', async () => {
    const result = await runAgent({
      adapter: mkAdapter(fx('claude-stall.json')),
      db,
      runId: 'r1',
      agentId: 'agent-stall',
      role: 'coder',
      runOptions: { prompt: 'p', workdir: workdirRoot },
      stallThresholdMs: 200,
      stallCheckMs: 50,
    });

    // The adapter sees the abort signal and returns status=aborted.
    expect(result.status).toBe('aborted');

    const stalled = listEventsByType(db, 'r1', 'agent.stalled');
    expect(stalled).toHaveLength(1);
    expect(stalled[0]?.source).toBe('agent-stall');
    // No agent.completed when it stalled.
    expect(listEventsByType(db, 'r1', 'agent.completed')).toHaveLength(0);
  }, 15_000);

  it('runs serially without leaking the watchdog interval', async () => {
    await runAgent({
      adapter: mkAdapter(fx('claude-normal.json')),
      db,
      runId: 'r1',
      agentId: 'agent-a',
      role: 'planner',
      runOptions: { prompt: 'p', workdir: workdirRoot },
    });
    await runAgent({
      adapter: mkAdapter(fx('claude-normal.json')),
      db,
      runId: 'r1',
      agentId: 'agent-b',
      role: 'reviewer',
      runOptions: { prompt: 'p', workdir: workdirRoot },
    });
    const all = listEventsByRun(db, 'r1');
    const spawnedCount = all.filter((e) => e.type === 'agent.spawned').length;
    const completedCount = all.filter((e) => e.type === 'agent.completed').length;
    expect(spawnedCount).toBe(2);
    expect(completedCount).toBe(2);
  });
});
