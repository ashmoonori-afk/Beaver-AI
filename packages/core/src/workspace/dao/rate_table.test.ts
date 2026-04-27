import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../db.js';
import { runMigrations } from '../migrate.js';

import {
  getCurrentRate,
  getRate,
  insertRate,
  listRatesForModel,
  type InsertRateInput,
} from './rate_table.js';

let db: Db;

const baseInput: InsertRateInput = {
  provider: 'anthropic',
  model: 'claude-opus',
  tokens_in_per_usd: 333_333,
  tokens_out_per_usd: 66_666,
  effective_from: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
});

afterEach(() => closeDb(db));

describe('rate_table DAO', () => {
  it('insert + get round-trip preserves numeric fields', () => {
    const row = insertRate(db, baseInput);
    expect(row.tokens_in_per_usd).toBe(333_333);
    expect(row.tokens_out_per_usd).toBe(66_666);
    expect(getRate(db, 'anthropic', 'claude-opus', '2026-01-01T00:00:00Z')).toEqual(row);
  });

  it('rejects duplicate composite PK', () => {
    insertRate(db, baseInput);
    expect(() => insertRate(db, baseInput)).toThrow();
  });

  it('getCurrentRate returns the most recent rate <= asOf', () => {
    insertRate(db, { ...baseInput, effective_from: '2026-01-01T00:00:00Z' });
    insertRate(db, {
      ...baseInput,
      tokens_in_per_usd: 400_000,
      effective_from: '2026-02-01T00:00:00Z',
    });
    insertRate(db, {
      ...baseInput,
      tokens_in_per_usd: 500_000,
      effective_from: '2026-03-01T00:00:00Z',
    });
    const r = getCurrentRate(db, 'anthropic', 'claude-opus', '2026-02-15T00:00:00Z');
    expect(r?.effective_from).toBe('2026-02-01T00:00:00Z');
    expect(r?.tokens_in_per_usd).toBe(400_000);
  });

  it('getCurrentRate returns null when nothing is effective yet', () => {
    insertRate(db, { ...baseInput, effective_from: '2026-02-01T00:00:00Z' });
    const r = getCurrentRate(db, 'anthropic', 'claude-opus', '2026-01-15T00:00:00Z');
    expect(r).toBeNull();
  });

  it('listRatesForModel returns rows sorted ascending by effective_from', () => {
    insertRate(db, { ...baseInput, effective_from: '2026-03-01T00:00:00Z' });
    insertRate(db, { ...baseInput, effective_from: '2026-01-01T00:00:00Z' });
    insertRate(db, { ...baseInput, effective_from: '2026-02-01T00:00:00Z' });
    const rows = listRatesForModel(db, 'anthropic', 'claude-opus');
    expect(rows.map((r) => r.effective_from)).toEqual([
      '2026-01-01T00:00:00Z',
      '2026-02-01T00:00:00Z',
      '2026-03-01T00:00:00Z',
    ]);
  });
});
