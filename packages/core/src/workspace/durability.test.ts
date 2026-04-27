// Foundation-level integration tests for the SQLite ledger.
// These exercise behaviors that only show up against a real on-disk
// database file — durability across reopen, multi-connection reads while
// one connection holds a write transaction, and migration idempotency
// on a persisted db.
//
// Hermetic via mkdtempSync; cleaned up in afterEach.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { closeDb, openDb, type Db } from './db.js';
import { runMigrations } from './migrate.js';

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-durability-'));
  dbPath = path.join(dir, 'beaver.db');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('durability', () => {
  it('inserted rows survive close + reopen (WAL)', () => {
    const a = openDb({ path: dbPath });
    runMigrations(a);
    a.exec(`
      INSERT INTO projects (id, name, root_path, created_at)
      VALUES ('p1', 'p', '/', '2026-04-27T00:00:00Z');
      INSERT INTO runs (id, project_id, goal, status, started_at, budget_usd)
      VALUES ('r1', 'p1', 'g', 'RUNNING', '2026-04-27T00:00:00Z', 20);
    `);
    closeDb(a);

    const b = openDb({ path: dbPath });
    const projects = b.prepare('SELECT * FROM projects').all();
    const runs = b.prepare('SELECT * FROM runs').all();
    expect(projects).toHaveLength(1);
    expect(runs).toHaveLength(1);
    closeDb(b);
  });

  it('migrations are idempotent across reopen', () => {
    const a = openDb({ path: dbPath });
    const first = runMigrations(a);
    closeDb(a);

    const b = openDb({ path: dbPath });
    const second = runMigrations(b);
    closeDb(b);

    expect(first.applied).toEqual(['001_initial']);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['001_initial']);
  });
});

describe('concurrent reads while one connection writes (WAL)', () => {
  let writer: Db;
  let reader1: Db;
  let reader2: Db;

  beforeEach(() => {
    writer = openDb({ path: dbPath });
    runMigrations(writer);
    writer.exec(`
      INSERT INTO projects (id, name, root_path, created_at)
      VALUES ('p1', 'p', '/', '2026-04-27T00:00:00Z');
    `);
    reader1 = openDb({ path: dbPath });
    reader2 = openDb({ path: dbPath });
  });

  afterEach(() => {
    closeDb(reader2);
    closeDb(reader1);
    closeDb(writer);
  });

  it('readers see the pre-transaction snapshot without SQLITE_BUSY', () => {
    writer.exec('BEGIN');
    writer.exec(
      `INSERT INTO projects (id, name, root_path, created_at)
       VALUES ('p2', 'p', '/', '2026-04-27T00:00:00Z')`,
    );

    // Both readers must succeed against an open write transaction. Under
    // the rollback-journal default they would block / SQLITE_BUSY; under
    // WAL they observe the last committed snapshot.
    const r1 = reader1.prepare('SELECT id FROM projects ORDER BY id').all();
    const r2 = reader2.prepare('SELECT id FROM projects ORDER BY id').all();

    expect(r1).toEqual([{ id: 'p1' }]);
    expect(r2).toEqual([{ id: 'p1' }]);

    writer.exec('COMMIT');

    const r1After = reader1.prepare('SELECT id FROM projects ORDER BY id').all();
    expect(r1After).toEqual([{ id: 'p1' }, { id: 'p2' }]);
  });
});
