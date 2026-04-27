// E2E tests for CodexAdapter via the mock CLI harness.
// The adapter spawns process.execPath with mock-cli + a fixture, so
// the run() happy path is exercised against deterministic input.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';
import { insertRate } from '../../workspace/dao/rate_table.js';
import { RunResultSchema } from '../../types/provider.js';

import { CodexAdapter } from './adapter.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', '_test', 'mock-cli.js');
const FX_DIR = path.join(HERE, '..', '_test', 'fixtures');
const fx = (name: string): string => path.join(FX_DIR, name);

let db: Db;
let workdir: string;
let workdirRoot: string;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  insertRate(db, {
    provider: 'codex',
    model: 'codex-test',
    tokens_in_per_usd: 1000,
    tokens_out_per_usd: 1000,
    effective_from: '2026-01-01T00:00:00Z',
  });
  workdirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-codex-adapter-'));
  workdir = workdirRoot;
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(workdirRoot, { recursive: true, force: true });
});

function mkAdapter(fixturePath: string): CodexAdapter {
  return new CodexAdapter({
    cliPath: process.execPath,
    defaultArgs: [MOCK_CLI, fixturePath],
    db,
  });
}

describe('CodexAdapter.run — happy path', () => {
  it('returns status=ok with merged usage and a non-empty summary', async () => {
    const adapter = mkAdapter(fx('codex-normal.json'));
    const captured: unknown[] = [];
    const result = await adapter.run({
      prompt: 'do the thing',
      workdir,
      onEvent: (e) => captured.push(e),
    });

    expect(result.status).toBe('ok');
    expect(result.usage.tokensIn).toBe(64);
    expect(result.usage.tokensOut).toBe(24);
    expect(result.usage.model).toBe('codex-test');
    expect(result.summary).toContain('Scanning workspace');
    expect(captured.length).toBeGreaterThan(0);

    // Schema parse passes (T5 verify).
    expect(() => RunResultSchema.parse(result)).not.toThrow();
  });

  it('writes the transcript as valid NDJSON under workdir', async () => {
    const adapter = mkAdapter(fx('codex-normal.json'));
    const result = await adapter.run({ prompt: 'p', workdir });

    expect(result.rawTranscriptPath).toBe(path.join(workdir, '.beaver-transcript.jsonl'));
    const lines = fs
      .readFileSync(result.rawTranscriptPath, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const ev = JSON.parse(line);
      expect(typeof ev.type).toBe('string');
      expect(ev.source).toBe('agent');
    }
  });
});

describe('CodexAdapter.run ??process failure', () => {
  it('returns status=failed when the CLI exits non-zero', async () => {
    const adapter = mkAdapter(fx('codex-nonzero.json'));
    const result = await adapter.run({ prompt: 'p', workdir });
    expect(result.status).toBe('failed');
    expect(() => RunResultSchema.parse(result)).not.toThrow();
  });
});

describe('CodexAdapter.cost', () => {
  it('uses the rate_table to convert usage to USD', () => {
    const adapter = mkAdapter(fx('codex-normal.json'));
    const c = adapter.cost({ tokensIn: 200, tokensOut: 300, model: 'codex-test' });
    expect(c.usd).toBeCloseTo(0.5);
  });
});
