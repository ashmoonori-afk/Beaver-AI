import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import {
  getTask,
  insertTask,
  listTasksByRun,
  updateTaskStatus,
  type InsertTaskInput,
} from './tasks.js';

let db: Db;

const baseInput: InsertTaskInput = {
  id: 't1',
  run_id: 'run1',
  role: 'planner',
  status: 'PENDING',
};

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  db.exec(
    "INSERT INTO projects (id, name, root_path, created_at) VALUES ('p1', 'p', '/tmp', '2026-04-27T00:00:00Z')",
  );
  db.exec(
    'INSERT INTO runs (id, project_id, goal, status, started_at, budget_usd) ' +
      "VALUES ('run1', 'p1', 'g', 'RUNNING', '2026-04-27T00:00:00Z', 10)",
  );
  db.exec(
    'INSERT INTO runs (id, project_id, goal, status, started_at, budget_usd) ' +
      "VALUES ('run2', 'p1', 'g', 'RUNNING', '2026-04-27T00:00:00Z', 10)",
  );
});

afterEach(() => closeDb(db));

describe('tasks DAO', () => {
  it('insert + get round-trip applies defaults', () => {
    const row = insertTask(db, baseInput);
    expect(row.spent_usd).toBe(0);
    expect(row.depends_on_json).toBe('[]');
    expect(row.parent_id).toBeNull();
    expect(row.budget_usd).toBeNull();
    expect(getTask(db, 't1')).toEqual(row);
  });

  it('preserves caller-provided depends_on_json and budget_usd', () => {
    const row = insertTask(db, {
      ...baseInput,
      depends_on_json: '["t0"]',
      budget_usd: 5,
    });
    expect(row.depends_on_json).toBe('["t0"]');
    expect(row.budget_usd).toBe(5);
  });

  it('get returns null for unknown id', () => {
    expect(getTask(db, 'missing')).toBeNull();
  });

  it('updateTaskStatus changes the row', () => {
    insertTask(db, baseInput);
    updateTaskStatus(db, 't1', 'DONE');
    expect(getTask(db, 't1')?.status).toBe('DONE');
  });

  it('rejects insert with unknown run_id (FK)', () => {
    expect(() => insertTask(db, { ...baseInput, run_id: 'ghost' })).toThrow();
  });

  it('listTasksByRun returns only that run tasks', () => {
    insertTask(db, { ...baseInput, id: 't1' });
    insertTask(db, { ...baseInput, id: 't2' });
    insertTask(db, { ...baseInput, id: 't3', run_id: 'run2' });
    const list = listTasksByRun(db, 'run1');
    expect(list.map((r) => r.id)).toEqual(['t1', 't2']);
  });
});
