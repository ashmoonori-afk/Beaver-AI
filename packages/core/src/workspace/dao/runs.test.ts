import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import {
  getRun,
  insertRun,
  listRunsByProject,
  updateRunStatus,
  type InsertRunInput,
} from './runs.js';

let db: Db;

const baseInput: InsertRunInput = {
  id: 'r1',
  project_id: 'p1',
  goal: 'goal',
  status: 'RUNNING',
  started_at: '2026-04-27T00:00:00Z',
  budget_usd: 20,
};

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  // Satisfy FK without importing the projects DAO (owned by another agent).
  db.exec(
    "INSERT INTO projects (id, name, root_path, created_at) VALUES ('p1', 'p', '/tmp', '2026-04-27T00:00:00Z')",
  );
  db.exec(
    "INSERT INTO projects (id, name, root_path, created_at) VALUES ('p2', 'p', '/tmp', '2026-04-27T00:00:00Z')",
  );
});

afterEach(() => closeDb(db));

describe('runs DAO', () => {
  it('insert + get round-trip applies defaults', () => {
    const row = insertRun(db, baseInput);
    expect(row.spent_usd).toBe(0);
    expect(row.ended_at).toBeNull();
    expect(row.id).toBe('r1');
    expect(getRun(db, 'r1')).toEqual(row);
  });

  it('get returns null for unknown id', () => {
    expect(getRun(db, 'missing')).toBeNull();
  });

  it('updateRunStatus changes the row', () => {
    insertRun(db, baseInput);
    updateRunStatus(db, 'r1', 'DONE');
    expect(getRun(db, 'r1')?.status).toBe('DONE');
  });

  it('rejects insert with unknown project_id (FK)', () => {
    expect(() => insertRun(db, { ...baseInput, project_id: 'ghost' })).toThrow();
  });

  it('listRunsByProject returns only that project rows ordered by started_at', () => {
    insertRun(db, { ...baseInput, id: 'r1', started_at: '2026-04-27T00:00:01Z' });
    insertRun(db, { ...baseInput, id: 'r2', started_at: '2026-04-27T00:00:00Z' });
    insertRun(db, { ...baseInput, id: 'r3', project_id: 'p2' });
    const list = listRunsByProject(db, 'p1');
    expect(list.map((r) => r.id)).toEqual(['r2', 'r1']);
  });
});
