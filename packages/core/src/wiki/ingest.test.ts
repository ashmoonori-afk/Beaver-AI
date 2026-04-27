import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClaudeCodeAdapter } from '../providers/claude-code/adapter.js';
import { closeDb, openDb, type Db } from '../workspace/db.js';
import { runMigrations } from '../workspace/migrate.js';
import { insertProject } from '../workspace/dao/projects.js';
import { insertRun } from '../workspace/dao/runs.js';
import { insertEvent } from '../workspace/dao/events.js';
import { insertRate } from '../workspace/dao/rate_table.js';

import { ensureWiki } from './bootstrap.js';
import { ingest } from './ingest.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', 'providers', '_test', 'mock-cli.js');
const FX = path.join(HERE, '__fixtures__');

let db: Db;
let configDir: string;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  insertRate(db, {
    provider: 'claude-code',
    model: 'test-model',
    tokens_in_per_usd: 1_000_000,
    tokens_out_per_usd: 1_000_000,
    effective_from: '2026-01-01T00:00:00Z',
  });
  insertProject(db, {
    id: 'demo',
    name: 'demo',
    root_path: '/tmp/demo',
    created_at: '2026-04-27T00:00:00Z',
  });
  insertRun(db, {
    id: 'run-fix-1',
    project_id: 'demo',
    goal: 'build login flow',
    status: 'ok',
    started_at: '2026-04-27T00:00:00Z',
    budget_usd: 1.0,
  });
  insertEvent(db, {
    run_id: 'run-fix-1',
    ts: '2026-04-27T00:00:01Z',
    source: 'orchestrator',
    type: 'state.transition',
    payload_json: null,
  });

  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-wiki-cfg-'));
  ensureWiki(configDir);
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(configDir, { recursive: true, force: true });
});

function adapterFor(fixture: string): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter({
    cliPath: process.execPath,
    defaultArgs: [MOCK_CLI, path.join(FX, fixture)],
    db,
  });
}

describe('ingest', () => {
  it('writes decisions/<runId>.md, projects/<slug>.md, index.md and appends to log.md', async () => {
    const adapter = adapterFor('ingest-ok.json');
    const result = await ingest({
      db,
      runId: 'run-fix-1',
      configDir,
      adapter,
      projectSlug: 'demo',
    });
    expect(result.status).toBe('ok');
    expect(result.appliedFiles).toContain('decisions/run-fix-1.md');
    expect(result.appliedFiles).toContain('projects/demo.md');
    expect(result.appliedFiles).toContain('index.md');

    const decisionPath = path.join(configDir, 'wiki', 'decisions', 'run-fix-1.md');
    expect(fs.existsSync(decisionPath)).toBe(true);
    const decisionBody = fs.readFileSync(decisionPath, 'utf8');
    expect(decisionBody).toContain('build login flow');
    expect(decisionBody).toMatch(/State:\s*ok/);

    const logBody = fs.readFileSync(path.join(configDir, 'wiki', 'log.md'), 'utf8');
    expect(logBody).toMatch(/ingest \| run-fix-1 · demo/);
  }, 15_000);

  it('returns validation_failed (no throw) when adapter returns malformed JSON', async () => {
    const adapter = adapterFor('ingest-bad.json');
    const result = await ingest({
      db,
      runId: 'run-fix-1',
      configDir,
      adapter,
      projectSlug: 'demo',
    });
    expect(result.status).toBe('validation_failed');
    expect(result.appliedFiles).toEqual([]);
    expect(result.error).toBeDefined();
    // log.md must NOT be appended on failure (it is the success marker).
    const logBody = fs.readFileSync(path.join(configDir, 'wiki', 'log.md'), 'utf8');
    expect(logBody).not.toMatch(/run-fix-1/);
  }, 15_000);

  it('is re-runnable: a second ingest replaces the same files without throwing', async () => {
    const adapter = adapterFor('ingest-ok.json');
    const first = await ingest({
      db,
      runId: 'run-fix-1',
      configDir,
      adapter,
      projectSlug: 'demo',
    });
    expect(first.status).toBe('ok');

    const adapter2 = adapterFor('ingest-ok.json');
    const second = await ingest({
      db,
      runId: 'run-fix-1',
      configDir,
      adapter: adapter2,
      projectSlug: 'demo',
    });
    expect(second.status).toBe('ok');
    expect(second.appliedFiles).toContain('decisions/run-fix-1.md');
    // log.md grew (one line per ingest)
    const logBody = fs.readFileSync(path.join(configDir, 'wiki', 'log.md'), 'utf8');
    const matches = logBody.match(/ingest \| run-fix-1 · demo/g) ?? [];
    expect(matches.length).toBe(2);
  }, 20_000);
});
