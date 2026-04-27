import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import {
  getLatestPlanForRun,
  getPlan,
  getPlanByRunVersion,
  insertPlan,
  listPlansByRun,
} from './plans.js';

let db: Db;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  db.exec(`
    INSERT INTO projects (id, name, root_path, created_at)
      VALUES ('p1', 'p', '/', '2026-04-27');
    INSERT INTO runs (id, project_id, goal, status, started_at, budget_usd)
      VALUES ('r1', 'p1', 'g', 'RUNNING', '2026-04-27', 20);
  `);
});

afterEach(() => closeDb(db));

describe('plans DAO', () => {
  it('insert + get round-trip preserves nullable parent_version', () => {
    const inserted = insertPlan(db, {
      id: 'pl1',
      run_id: 'r1',
      version: 1,
      content_path: '/plans/pl1.md',
    });
    expect(inserted.parent_version).toBeNull();
    expect(inserted.modified_by).toBeNull();

    const fetched = getPlan(db, 'pl1');
    expect(fetched).toEqual(inserted);
  });

  it('preserves explicit parent_version and modified_by', () => {
    insertPlan(db, { id: 'pl1', run_id: 'r1', version: 1, content_path: '/p/1.md' });
    const v2 = insertPlan(db, {
      id: 'pl2',
      run_id: 'r1',
      version: 2,
      parent_version: 1,
      modified_by: 'planner',
      content_path: '/p/2.md',
    });
    expect(v2.parent_version).toBe(1);
    expect(v2.modified_by).toBe('planner');
  });

  it('rejects duplicate (run_id, version) via UNIQUE constraint', () => {
    insertPlan(db, { id: 'pl1', run_id: 'r1', version: 1, content_path: '/p/1.md' });
    expect(() =>
      insertPlan(db, { id: 'pl1b', run_id: 'r1', version: 1, content_path: '/p/1b.md' }),
    ).toThrow();
  });

  it('getPlanByRunVersion returns the matching row or null', () => {
    insertPlan(db, { id: 'pl1', run_id: 'r1', version: 1, content_path: '/p/1.md' });
    const found = getPlanByRunVersion(db, 'r1', 1);
    expect(found?.id).toBe('pl1');
    expect(getPlanByRunVersion(db, 'r1', 99)).toBeNull();
  });

  it('getLatestPlanForRun returns the highest version', () => {
    insertPlan(db, { id: 'pl1', run_id: 'r1', version: 1, content_path: '/p/1.md' });
    insertPlan(db, { id: 'pl3', run_id: 'r1', version: 3, content_path: '/p/3.md' });
    insertPlan(db, { id: 'pl2', run_id: 'r1', version: 2, content_path: '/p/2.md' });
    const latest = getLatestPlanForRun(db, 'r1');
    expect(latest?.id).toBe('pl3');
    expect(latest?.version).toBe(3);
  });

  it('getLatestPlanForRun returns null for an unknown run', () => {
    expect(getLatestPlanForRun(db, 'nope')).toBeNull();
  });

  it('listPlansByRun returns all versions ascending', () => {
    insertPlan(db, { id: 'pl3', run_id: 'r1', version: 3, content_path: '/p/3.md' });
    insertPlan(db, { id: 'pl1', run_id: 'r1', version: 1, content_path: '/p/1.md' });
    insertPlan(db, { id: 'pl2', run_id: 'r1', version: 2, content_path: '/p/2.md' });
    const rows = listPlansByRun(db, 'r1');
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3]);
  });

  it('listPlansByRun returns [] for a run with no plans', () => {
    expect(listPlansByRun(db, 'r1')).toEqual([]);
  });
});
