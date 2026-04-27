import { describe, it, expect } from 'vitest';

import { closeDb, openDb, type Db } from './db.js';
import { runMigrations } from './migrate.js';

const EXPECTED_TABLES = [
  'agents',
  'artifacts',
  'checkpoints',
  'costs',
  'events',
  'plans',
  'projects',
  'rate_table',
  'runs',
  'tasks',
];

function listUserTables(db: Db): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

describe('runMigrations', () => {
  it('applies 001_initial on an empty :memory: db', () => {
    const db = openDb({ path: ':memory:' });
    const r = runMigrations(db);
    expect(r.applied).toEqual(['001_initial']);
    expect(r.skipped).toEqual([]);

    const tables = listUserTables(db);
    for (const name of EXPECTED_TABLES) expect(tables).toContain(name);
    expect(tables).toContain('_migrations');
    closeDb(db);
  });

  it('is idempotent on re-run', () => {
    const db = openDb({ path: ':memory:' });
    runMigrations(db);
    const second = runMigrations(db);
    expect(second.applied).toEqual([]);
    expect(second.skipped).toEqual(['001_initial']);
    closeDb(db);
  });

  it('records each applied migration in _migrations', () => {
    const db = openDb({ path: ':memory:' });
    runMigrations(db);
    const rows = db.prepare('SELECT name FROM _migrations ORDER BY name').all() as {
      name: string;
    }[];
    expect(rows.map((r) => r.name)).toEqual(['001_initial']);
    closeDb(db);
  });
});
