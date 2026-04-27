import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import { getCost, insertCost, listCostsByRun, sumCostsByAgent, sumCostsByRun } from './costs.js';

let db: Db;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  db.exec(`
    INSERT INTO projects (id, name, root_path, created_at)
      VALUES ('p1', 'p', '/', '2026-04-27');
    INSERT INTO runs (id, project_id, goal, status, started_at, budget_usd)
      VALUES ('r1', 'p1', 'g', 'RUNNING', '2026-04-27', 20);
    INSERT INTO tasks (id, run_id, role, status)
      VALUES ('t1', 'r1', 'coder', 'ready');
    INSERT INTO agents (id, task_id, provider, worktree_path, branch, status, budget_usd)
      VALUES ('a1', 't1', 'codex', '/wt1', 'beaver/r1/a1', 'running', 1.0),
             ('a2', 't1', 'codex', '/wt2', 'beaver/r1/a2', 'running', 1.0);
  `);
});

afterEach(() => closeDb(db));

describe('costs DAO', () => {
  it('insert + get round-trip; AUTOINCREMENT id is assigned and returned', () => {
    const inserted = insertCost(db, {
      run_id: 'r1',
      agent_id: 'a1',
      provider: 'anthropic',
      tokens_in: 100,
      tokens_out: 200,
      usd: 0.5,
      model: 'claude',
      ts: '2026-04-27T00:00:00Z',
    });
    expect(typeof inserted.id).toBe('number');
    expect(inserted.id).toBeGreaterThan(0);

    const fetched = getCost(db, inserted.id);
    expect(fetched).toEqual(inserted);
  });

  it('agent_id is nullable: insert without agent_id works', () => {
    const inserted = insertCost(db, {
      run_id: 'r1',
      provider: 'anthropic',
      tokens_in: 10,
      tokens_out: 20,
      usd: 0.1,
      model: 'claude',
      ts: '2026-04-27T00:00:00Z',
    });
    expect(inserted.agent_id).toBeNull();

    const explicitNull = insertCost(db, {
      run_id: 'r1',
      agent_id: null,
      provider: 'anthropic',
      tokens_in: 5,
      tokens_out: 5,
      usd: 0.05,
      model: 'claude',
      ts: '2026-04-27T00:00:01Z',
    });
    expect(explicitNull.agent_id).toBeNull();
  });

  it('getCost returns null for unknown id', () => {
    expect(getCost(db, 99999)).toBeNull();
  });

  it('sumCostsByRun sums all rows for a run; returns 0 for unknown run', () => {
    insertCost(db, {
      run_id: 'r1',
      agent_id: 'a1',
      provider: 'anthropic',
      tokens_in: 1,
      tokens_out: 1,
      usd: 0.25,
      model: 'claude',
      ts: '2026-04-27T00:00:00Z',
    });
    insertCost(db, {
      run_id: 'r1',
      agent_id: 'a2',
      provider: 'anthropic',
      tokens_in: 1,
      tokens_out: 1,
      usd: 0.75,
      model: 'claude',
      ts: '2026-04-27T00:00:01Z',
    });
    expect(sumCostsByRun(db, 'r1')).toBeCloseTo(1.0, 10);
    expect(sumCostsByRun(db, 'unknown')).toBe(0);
  });

  it("sumCostsByAgent sums only the given agent's rows", () => {
    insertCost(db, {
      run_id: 'r1',
      agent_id: 'a1',
      provider: 'anthropic',
      tokens_in: 1,
      tokens_out: 1,
      usd: 0.4,
      model: 'claude',
      ts: '2026-04-27T00:00:00Z',
    });
    insertCost(db, {
      run_id: 'r1',
      agent_id: 'a1',
      provider: 'anthropic',
      tokens_in: 1,
      tokens_out: 1,
      usd: 0.6,
      model: 'claude',
      ts: '2026-04-27T00:00:01Z',
    });
    insertCost(db, {
      run_id: 'r1',
      agent_id: 'a2',
      provider: 'anthropic',
      tokens_in: 1,
      tokens_out: 1,
      usd: 9.99,
      model: 'claude',
      ts: '2026-04-27T00:00:02Z',
    });
    expect(sumCostsByAgent(db, 'a1')).toBeCloseTo(1.0, 10);
    expect(sumCostsByAgent(db, 'unknown')).toBe(0);
  });

  it('listCostsByRun returns rows in chronological order', () => {
    insertCost(db, {
      run_id: 'r1',
      agent_id: 'a1',
      provider: 'anthropic',
      tokens_in: 1,
      tokens_out: 1,
      usd: 0.1,
      model: 'claude',
      ts: '2026-04-27T00:00:02Z',
    });
    insertCost(db, {
      run_id: 'r1',
      agent_id: 'a1',
      provider: 'anthropic',
      tokens_in: 1,
      tokens_out: 1,
      usd: 0.1,
      model: 'claude',
      ts: '2026-04-27T00:00:00Z',
    });
    insertCost(db, {
      run_id: 'r1',
      agent_id: 'a1',
      provider: 'anthropic',
      tokens_in: 1,
      tokens_out: 1,
      usd: 0.1,
      model: 'claude',
      ts: '2026-04-27T00:00:01Z',
    });
    const rows = listCostsByRun(db, 'r1');
    expect(rows.map((r) => r.ts)).toEqual([
      '2026-04-27T00:00:00Z',
      '2026-04-27T00:00:01Z',
      '2026-04-27T00:00:02Z',
    ]);
  });

  it('listCostsByRun returns [] when no rows exist for the run', () => {
    expect(listCostsByRun(db, 'r1')).toEqual([]);
  });
});
