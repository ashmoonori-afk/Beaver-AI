import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClaudeCodeAdapter } from '../../providers/claude-code/adapter.js';
import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';
import { insertRate } from '../../workspace/dao/rate_table.js';

import { satisfiedCheck } from './satisfiedCheck.js';
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

describe('satisfiedCheck', () => {
  it('returns satisfied=true with empty gaps on a valid response', async () => {
    const adapter = adapterFor('satisfied-ok.json');
    const out = await satisfiedCheck({
      adapter,
      goal: 'create hello.txt with body hi',
      planOutputs: [{ taskId: 't1', summary: 'wrote hello.txt' }],
    });
    expect(out.satisfied).toBe(true);
    expect(out.gaps).toEqual([]);
  });

  it('throws SubDecisionValidationError on type-mismatched response twice', async () => {
    const adapter = adapterFor('satisfied-bad.json');
    let caught: unknown;
    try {
      await satisfiedCheck({
        adapter,
        goal: 'g',
        planOutputs: [],
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SubDecisionValidationError);
    expect((caught as SubDecisionValidationError).decisionName).toBe('satisfiedCheck');
  }, 15_000);
});
