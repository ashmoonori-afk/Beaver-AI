import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClaudeCodeAdapter } from '../../providers/claude-code/adapter.js';
import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';
import { insertRate } from '../../workspace/dao/rate_table.js';

import { reviewVerdict } from './reviewVerdict.js';
import { SubDecisionValidationError } from './runner.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', '..', 'providers', '_test', 'mock-cli.js');
const FX = path.join(HERE, '__fixtures__');

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

function adapterFor(fixture: string): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter({
    cliPath: process.execPath,
    defaultArgs: [MOCK_CLI, path.join(FX, fixture)],
    db,
  });
}

describe('reviewVerdict', () => {
  it('returns parsed accept verdict on valid response', async () => {
    const adapter = adapterFor('review-ok.json');
    const out = await reviewVerdict({
      adapter,
      taskOutput: 'wrote hello.txt',
      criteria: ['file exists', 'matches body'],
    });
    expect(out.verdict).toBe('accept');
    expect(out.reason.length).toBeGreaterThan(0);
  });

  it('throws SubDecisionValidationError when verdict is unknown twice', async () => {
    const adapter = adapterFor('review-bad.json');
    let caught: unknown;
    try {
      await reviewVerdict({
        adapter,
        taskOutput: 'x',
        criteria: ['c'],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SubDecisionValidationError);
    expect((caught as SubDecisionValidationError).decisionName).toBe('reviewVerdict');
  }, 15_000);
});
