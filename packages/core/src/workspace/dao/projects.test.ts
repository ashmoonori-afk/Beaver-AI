import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import { getProject, insertProject, listProjects, type InsertProjectInput } from './projects.js';

let db: Db;

const baseInput: InsertProjectInput = {
  id: 'p1',
  name: 'demo',
  root_path: '/tmp/demo',
  created_at: '2026-04-27T00:00:00Z',
};

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
});

afterEach(() => closeDb(db));

describe('projects DAO', () => {
  it('insert + get round-trip preserves all fields', () => {
    const row = insertProject(db, { ...baseInput, config_json: '{"k":1}' });
    expect(row.id).toBe('p1');
    expect(row.name).toBe('demo');
    expect(row.root_path).toBe('/tmp/demo');
    expect(row.config_json).toBe('{"k":1}');
    expect(getProject(db, 'p1')).toEqual(row);
  });

  it('insert without config_json stores null', () => {
    const row = insertProject(db, baseInput);
    expect(row.config_json).toBeNull();
  });

  it('get returns null for unknown id', () => {
    expect(getProject(db, 'missing')).toBeNull();
  });

  it('listProjects returns all rows ordered by created_at asc', () => {
    insertProject(db, { ...baseInput, id: 'p1', created_at: '2026-04-27T00:00:02Z' });
    insertProject(db, { ...baseInput, id: 'p2', created_at: '2026-04-27T00:00:00Z' });
    insertProject(db, { ...baseInput, id: 'p3', created_at: '2026-04-27T00:00:01Z' });
    const rows = listProjects(db);
    expect(rows.map((r) => r.id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('rejects duplicate id (PK violation)', () => {
    insertProject(db, baseInput);
    expect(() => insertProject(db, baseInput)).toThrow();
  });
});
