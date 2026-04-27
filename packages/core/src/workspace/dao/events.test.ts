import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import * as events from './events.js';
import {
  getEvent,
  insertEvent,
  listEventsByRun,
  listEventsByType,
  type InsertEventInput,
} from './events.js';

let db: Db;

const baseInput: InsertEventInput = {
  run_id: 'r1',
  ts: '2026-04-27T00:00:00Z',
  source: 'orchestrator',
  type: 'run.start',
};

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  db.exec(
    "INSERT INTO projects (id, name, root_path, created_at) VALUES ('p1', 'p', '/', '2026-04-27')",
  );
  db.exec(
    "INSERT INTO runs (id, project_id, goal, status, started_at, budget_usd) VALUES ('r1', 'p1', 'g', 'RUNNING', '2026-04-27', 20)",
  );
});

afterEach(() => closeDb(db));

describe('events DAO', () => {
  it('insert + get round-trip; id is positive number; payload_json round-trips', () => {
    const payload = '{"foo":"bar"}';
    const row = insertEvent(db, { ...baseInput, payload_json: payload });
    expect(typeof row.id).toBe('number');
    expect(row.id).toBeGreaterThan(0);
    expect(row.payload_json).toBe(payload);
    expect(getEvent(db, row.id)).toEqual(row);
  });

  it('payload_json defaults to null when omitted', () => {
    const row = insertEvent(db, baseInput);
    expect(row.payload_json).toBeNull();
  });

  it('getEvent returns null for unknown id', () => {
    expect(getEvent(db, 99999)).toBeNull();
  });

  it('listEventsByRun returns rows in chronological order', () => {
    insertEvent(db, { ...baseInput, ts: '2026-04-27T00:00:02Z' });
    insertEvent(db, { ...baseInput, ts: '2026-04-27T00:00:00Z' });
    insertEvent(db, { ...baseInput, ts: '2026-04-27T00:00:01Z' });
    const list = listEventsByRun(db, 'r1');
    expect(list.map((e) => e.ts)).toEqual([
      '2026-04-27T00:00:00Z',
      '2026-04-27T00:00:01Z',
      '2026-04-27T00:00:02Z',
    ]);
  });

  it('listEventsByType filters by type', () => {
    insertEvent(db, { ...baseInput, type: 'run.start' });
    insertEvent(db, { ...baseInput, type: 'task.done', ts: '2026-04-27T00:00:01Z' });
    insertEvent(db, { ...baseInput, type: 'task.done', ts: '2026-04-27T00:00:02Z' });
    const list = listEventsByType(db, 'r1', 'task.done');
    expect(list.length).toBe(2);
    expect(list.every((e) => e.type === 'task.done')).toBe(true);
  });

  it('rejects insert with unknown run_id (FK)', () => {
    expect(() => insertEvent(db, { ...baseInput, run_id: 'ghost' })).toThrow();
  });

  it('exposes no updateEvent or deleteEvent', () => {
    expect((events as Record<string, unknown>).updateEvent).toBeUndefined();
    expect((events as Record<string, unknown>).deleteEvent).toBeUndefined();
  });
});
