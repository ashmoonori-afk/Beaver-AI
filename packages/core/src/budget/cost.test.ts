import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { closeDb, openDb, type Db } from '../workspace/db.js';
import { runMigrations } from '../workspace/migrate.js';
import { insertRate } from '../workspace/dao/rate_table.js';

import { computeCost } from './cost.js';

let db: Db;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  insertRate(db, {
    provider: 'claude-code',
    model: 'test-model',
    tokens_in_per_usd: 1000,
    tokens_out_per_usd: 1000,
    effective_from: '2026-01-01T00:00:00Z',
  });
});
afterEach(() => closeDb(db));

describe('computeCost', () => {
  it('converts tokens to USD using the rate effective at the asOf time', () => {
    const c = computeCost(
      db,
      { tokensIn: 100, tokensOut: 100, model: 'test-model' },
      { provider: 'claude-code', asOf: '2026-04-27T00:00:00Z' },
    );
    expect(c.usd).toBeCloseTo(0.2);
    expect(c.tokensIn).toBe(100);
    expect(c.tokensOut).toBe(100);
  });

  it('throws when no rate matches the (provider, model, asOf) tuple', () => {
    expect(() =>
      computeCost(
        db,
        { tokensIn: 1, tokensOut: 1, model: 'unknown-model' },
        { provider: 'claude-code', asOf: '2026-04-27T00:00:00Z' },
      ),
    ).toThrow(/no rate_table entry/);
  });

  it('returns 0 USD for 0 tokens', () => {
    const c = computeCost(
      db,
      { tokensIn: 0, tokensOut: 0, model: 'test-model' },
      { provider: 'claude-code', asOf: '2026-04-27T00:00:00Z' },
    );
    expect(c.usd).toBe(0);
  });
});
