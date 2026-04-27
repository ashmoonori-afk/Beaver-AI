import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import {
  answerCheckpoint,
  getCheckpoint,
  insertCheckpoint,
  listPendingCheckpoints,
  updateCheckpointStatus,
} from './checkpoints.js';

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

describe('checkpoints DAO', () => {
  it('insert + get round-trip; response starts null', () => {
    const inserted = insertCheckpoint(db, {
      id: 'c1',
      run_id: 'r1',
      kind: 'approval',
      status: 'pending',
      prompt: 'proceed?',
    });
    expect(inserted.response).toBeNull();
    expect(inserted.status).toBe('pending');

    const fetched = getCheckpoint(db, 'c1');
    expect(fetched).toEqual(inserted);
  });

  it('getCheckpoint returns null for unknown id', () => {
    expect(getCheckpoint(db, 'nope')).toBeNull();
  });

  it('updateCheckpointStatus updates only the status', () => {
    insertCheckpoint(db, {
      id: 'c1',
      run_id: 'r1',
      kind: 'approval',
      status: 'pending',
      prompt: 'proceed?',
    });
    updateCheckpointStatus(db, 'c1', 'cancelled');
    const fetched = getCheckpoint(db, 'c1');
    expect(fetched?.status).toBe('cancelled');
    expect(fetched?.response).toBeNull();
  });

  it('answerCheckpoint sets response AND status atomically', () => {
    insertCheckpoint(db, {
      id: 'c1',
      run_id: 'r1',
      kind: 'approval',
      status: 'pending',
      prompt: 'proceed?',
    });
    answerCheckpoint(db, 'c1', 'yes, go');
    const fetched = getCheckpoint(db, 'c1');
    expect(fetched?.response).toBe('yes, go');
    expect(fetched?.status).toBe('answered');
  });

  it('listPendingCheckpoints returns only pending rows for the given run', () => {
    insertCheckpoint(db, {
      id: 'c1',
      run_id: 'r1',
      kind: 'approval',
      status: 'pending',
      prompt: 'q1',
    });
    insertCheckpoint(db, {
      id: 'c2',
      run_id: 'r1',
      kind: 'approval',
      status: 'answered',
      prompt: 'q2',
    });
    insertCheckpoint(db, {
      id: 'c3',
      run_id: 'r1',
      kind: 'approval',
      status: 'pending',
      prompt: 'q3',
    });
    const pending = listPendingCheckpoints(db, 'r1');
    const ids = pending.map((c) => c.id).sort();
    expect(ids).toEqual(['c1', 'c3']);
    for (const c of pending) expect(c.status).toBe('pending');
  });

  it('listPendingCheckpoints returns [] when none pending', () => {
    expect(listPendingCheckpoints(db, 'r1')).toEqual([]);
  });
});
