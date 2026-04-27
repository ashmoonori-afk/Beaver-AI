import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import {
  getAgent,
  insertAgent,
  listAgentsByTask,
  updateAgentStatus,
  type InsertAgentInput,
} from './agents.js';

let db: Db;

const baseInput: InsertAgentInput = {
  id: 'a1',
  task_id: 't1',
  provider: 'anthropic',
  worktree_path: '/tmp/wt-a1',
  branch: 'feat/a1',
  status: 'IDLE',
  budget_usd: 5,
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
    "INSERT INTO tasks (id, run_id, role, status) VALUES ('t1', 'run1', 'planner', 'PENDING')",
  );
  db.exec(
    "INSERT INTO tasks (id, run_id, role, status) VALUES ('t2', 'run1', 'planner', 'PENDING')",
  );
});

afterEach(() => closeDb(db));

describe('agents DAO', () => {
  it('insert + get round-trip applies spent_usd default', () => {
    const row = insertAgent(db, baseInput);
    expect(row.spent_usd).toBe(0);
    expect(row.branch).toBe('feat/a1');
    expect(getAgent(db, 'a1')).toEqual(row);
  });

  it('get returns null for unknown id', () => {
    expect(getAgent(db, 'missing')).toBeNull();
  });

  it('updateAgentStatus changes the row', () => {
    insertAgent(db, baseInput);
    updateAgentStatus(db, 'a1', 'BUSY');
    expect(getAgent(db, 'a1')?.status).toBe('BUSY');
  });

  it('rejects insert with unknown task_id (FK)', () => {
    expect(() => insertAgent(db, { ...baseInput, task_id: 'ghost' })).toThrow();
  });

  it('listAgentsByTask returns only that task agents', () => {
    insertAgent(db, { ...baseInput, id: 'a1' });
    insertAgent(db, { ...baseInput, id: 'a2' });
    insertAgent(db, { ...baseInput, id: 'a3', task_id: 't2' });
    const list = listAgentsByTask(db, 't1');
    expect(list.map((r) => r.id)).toEqual(['a1', 'a2']);
  });
});
