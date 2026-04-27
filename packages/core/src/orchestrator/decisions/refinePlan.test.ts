import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Plan } from '../../plan/schema.js';
import { ClaudeCodeAdapter } from '../../providers/claude-code/adapter.js';
import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';
import { insertRate } from '../../workspace/dao/rate_table.js';

import { refinePlan } from './refinePlan.js';
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

const seedPlan: Plan = {
  version: 1,
  goal: 'build something',
  tasks: [],
  createdAt: '2026-04-27T00:00:00Z',
};

describe('refinePlan', () => {
  it('returns a valid Plan when the model emits one as the final JSON line', async () => {
    const adapter = adapterFor('refine-plan-ok.json');
    const result = await refinePlan({
      adapter,
      plan: seedPlan,
      goal: 'build something',
      userComment: 'add a scaffold task',
    });
    expect(result.version).toBe(2);
    expect(result.parentVersion).toBe(1);
    expect(result.modifiedBy).toBe('planner');
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0]?.id).toBe('scaffold');
  });

  it('throws SubDecisionValidationError when the model returns invalid JSON twice', async () => {
    const adapter = adapterFor('refine-plan-bad.json');
    let caught: unknown;
    try {
      await refinePlan({
        adapter,
        plan: seedPlan,
        goal: 'build something',
        userComment: 'broken',
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SubDecisionValidationError);
    const err = caught as SubDecisionValidationError;
    expect(err.decisionName).toBe('refinePlan');
    expect(err.attempts).toBe(2);
  }, 15_000);
});
