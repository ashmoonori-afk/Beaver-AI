import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Plan } from '../../plan/schema.js';
import { ClaudeCodeAdapter } from '../../providers/claude-code/adapter.js';
import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';
import { insertRate } from '../../workspace/dao/rate_table.js';

import { pickNextTask } from './pickNextTask.js';
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
  tasks: [
    {
      id: 'scaffold',
      role: 'coder',
      goal: 'g',
      prompt: 'p',
      dependsOn: [],
      acceptanceCriteria: ['compiles'],
      capabilitiesNeeded: [],
    },
  ],
  createdAt: '2026-04-27T00:00:00Z',
};

describe('pickNextTask', () => {
  it('returns parsed { taskId, providerName, roleName } on a valid response', async () => {
    const adapter = adapterFor('pick-next-ok.json');
    const out = await pickNextTask({ adapter, plan: seedPlan, completedIds: [] });
    expect(out.taskId).toBe('scaffold');
    expect(out.providerName).toBe('claude-code');
    expect(out.roleName).toBe('coder');
  });

  it('throws SubDecisionValidationError when JSON is invalid twice', async () => {
    const adapter = adapterFor('pick-next-bad.json');
    let caught: unknown;
    try {
      await pickNextTask({ adapter, plan: seedPlan, completedIds: [] });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SubDecisionValidationError);
    expect((caught as SubDecisionValidationError).decisionName).toBe('pickNextTask');
  }, 15_000);
});
