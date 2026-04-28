import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDb, openDb, type Db } from '../workspace/db.js';
import { runMigrations } from '../workspace/migrate.js';
import { getRate } from '../workspace/dao/rate_table.js';

import { seedRatesFromJson } from './seed.js';

let db: Db;
let dir: string;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-rates-'));
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeFile(name: string, body: unknown): void {
  fs.writeFileSync(path.join(dir, name), JSON.stringify(body));
}

describe('seedRatesFromJson', () => {
  it('inserts every rate entry from each JSON file', () => {
    writeFile('claude-code.json', {
      provider: 'claude-code',
      rates: [
        {
          model: 'claude-3-5-sonnet',
          tokens_in_per_usd: 333334,
          tokens_out_per_usd: 66667,
          effective_from: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    writeFile('codex.json', {
      provider: 'codex',
      rates: [
        {
          model: 'codex',
          tokens_in_per_usd: 250000,
          tokens_out_per_usd: 50000,
          effective_from: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const result = seedRatesFromJson(db, dir);
    expect(result.files).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(
      getRate(db, 'claude-code', 'claude-3-5-sonnet', '2026-01-01T00:00:00.000Z'),
    ).toBeTruthy();
    expect(getRate(db, 'codex', 'codex', '2026-01-01T00:00:00.000Z')).toBeTruthy();
  });

  it('is idempotent — second call inserts nothing', () => {
    writeFile('p.json', {
      provider: 'p',
      rates: [
        {
          model: 'm',
          tokens_in_per_usd: 1000,
          tokens_out_per_usd: 200,
          effective_from: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    seedRatesFromJson(db, dir);
    const second = seedRatesFromJson(db, dir);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it('rejects malformed JSON via zod', () => {
    fs.writeFileSync(path.join(dir, 'bad.json'), '{"provider":"x"}');
    expect(() => seedRatesFromJson(db, dir)).toThrow();
  });

  it('returns zeros when the directory does not exist', () => {
    const result = seedRatesFromJson(db, path.join(dir, 'does-not-exist'));
    expect(result).toEqual({ inserted: 0, skipped: 0, files: 0 });
  });
});
