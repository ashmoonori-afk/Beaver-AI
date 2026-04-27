import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../workspace/db.js';
import { runMigrations } from '../workspace/migrate.js';

import { answer, pendingFor, post, waitForAnswer } from './checkpoint.js';

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

describe('checkpoint primitive', () => {
  it('post + answer round-trip; pendingFor reflects state', () => {
    const { id } = post(db, { kind: 'plan-approval', runId: 'r1', prompt: 'ok?' });
    expect(pendingFor(db, 'r1').map((c) => c.id)).toEqual([id]);
    answer(db, id, 'approve');
    expect(pendingFor(db, 'r1')).toEqual([]);
  });

  it('post rejects unknown kind at the API boundary', () => {
    expect(() => post(db, { kind: 'bogus-kind', runId: 'r1', prompt: 'q' })).toThrow();
  });

  it('answer rejects unknown id', () => {
    expect(() => answer(db, 'no-such', 'approve')).toThrow(/no such checkpoint/);
  });

  it('answer rejects malformed plan-approval response', () => {
    const { id } = post(db, { kind: 'plan-approval', runId: 'r1', prompt: 'q' });
    expect(() => answer(db, id, 'maybe')).toThrow();
  });

  it('answer rejects malformed budget-exceeded response', () => {
    const { id } = post(db, { kind: 'budget-exceeded', runId: 'r1', prompt: 'q' });
    expect(() => answer(db, id, 'continue-twice')).toThrow();
    answer(db, id, 'continue-once');
    expect(pendingFor(db, 'r1')).toEqual([]);
  });

  it('accepts comment:<text> on approve-style checkpoints', () => {
    const { id } = post(db, { kind: 'plan-approval', runId: 'r1', prompt: 'q' });
    answer(db, id, 'comment:skip auth');
    expect(pendingFor(db, 'r1')).toEqual([]);
  });

  it('waitForAnswer resolves within 500 ms of an answer write', async () => {
    const { id } = post(db, { kind: 'plan-approval', runId: 'r1', prompt: 'q' });
    const t0 = Date.now();
    const p = waitForAnswer(db, id, { pollMs: 25 });
    setTimeout(() => answer(db, id, 'approve'), 50);
    const r = await p;
    expect(r).toBe('approve');
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('waitForAnswer aborts within 100 ms when the signal fires', async () => {
    const { id } = post(db, { kind: 'plan-approval', runId: 'r1', prompt: 'q' });
    const ac = new AbortController();
    const t0 = Date.now();
    const p = waitForAnswer(db, id, { pollMs: 25, signal: ac.signal });
    setTimeout(() => ac.abort(), 25);
    await expect(p).rejects.toThrow(/aborted/);
    expect(Date.now() - t0).toBeLessThan(150);
  });

  it('two pollers see the same answer', async () => {
    const { id } = post(db, { kind: 'plan-approval', runId: 'r1', prompt: 'q' });
    const a = waitForAnswer(db, id, { pollMs: 25 });
    const b = waitForAnswer(db, id, { pollMs: 25 });
    setTimeout(() => answer(db, id, 'approve'), 30);
    const [ra, rb] = await Promise.all([a, b]);
    expect(ra).toBe('approve');
    expect(rb).toBe('approve');
  });

  it('waitForAnswer rejects immediately when signal is already aborted', async () => {
    const { id } = post(db, { kind: 'plan-approval', runId: 'r1', prompt: 'q' });
    const ac = new AbortController();
    ac.abort();
    await expect(waitForAnswer(db, id, { signal: ac.signal })).rejects.toThrow(/aborted/);
  });
});
