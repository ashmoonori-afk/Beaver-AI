// E2E tests for ClaudeCodeAdapter via the mock CLI harness.
// The adapter spawns process.execPath with mock-cli + a fixture, so all
// branches of run() are exercised against deterministic input.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';
import { insertRate } from '../../workspace/dao/rate_table.js';
import { RunResultSchema } from '../../types/provider.js';

import { ClaudeCodeAdapter } from './adapter.js';

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
    provider: 'claude-code',
    model: 'test-model',
    tokens_in_per_usd: 1000,
    tokens_out_per_usd: 1000,
    effective_from: '2026-01-01T00:00:00Z',
  });
  workdirRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-claude-adapter-'));
  workdir = workdirRoot;
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(workdirRoot, { recursive: true, force: true });
});

function mkAdapter(fixturePath: string): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter({
    cliPath: process.execPath,
    defaultArgs: [MOCK_CLI, fixturePath],
    db,
  });
}

describe('ClaudeCodeAdapter.run — happy path', () => {
  it('returns status=ok with merged usage and a non-empty summary', async () => {
    const adapter = mkAdapter(fx('claude-normal.json'));
    const captured: unknown[] = [];
    const result = await adapter.run({
      prompt: 'do the thing',
      workdir,
      onEvent: (e) => captured.push(e),
    });

    expect(result.status).toBe('ok');
    expect(result.usage.tokensIn).toBe(80);
    expect(result.usage.tokensOut).toBe(12);
    expect(result.usage.model).toBe('test-model');
    expect(result.summary).toContain('Reading workspace');
    expect(captured.length).toBeGreaterThan(0);

    // Schema parse passes (T5 verify).
    expect(() => RunResultSchema.parse(result)).not.toThrow();
  });

  it('writes the transcript as valid NDJSON under workdir', async () => {
    const adapter = mkAdapter(fx('claude-normal.json'));
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

describe('ClaudeCodeAdapter.run — budget enforcement', () => {
  it('aborts with status=budget_exceeded after 3 turns when cap is 0.5 USD', async () => {
    const adapter = mkAdapter(fx('claude-budget-exceeded.json'));
    const captured: unknown[] = [];
    const result = await adapter.run({
      prompt: 'p',
      workdir,
      budget: { usd: 0.5, warnThresholdPct: 70 },
      onEvent: (e) => captured.push(e),
    });

    expect(result.status).toBe('budget_exceeded');
    // 100 in + 100 out per turn at $1/1000 each = $0.2/turn.
    // After turn 3 the running total reaches $0.6, which trips the $0.5 cap.
    expect(result.usage.tokensIn).toBe(300);
    expect(result.usage.tokensOut).toBe(300);

    // Turn-4 message_delta must NOT have been forwarded — adapter killed the child first.
    const sawTurn4 = captured.some(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        (e as { payload?: { text?: string } }).payload?.text === 'turn 4 (must NOT reach)',
    );
    expect(sawTurn4).toBe(false);
  });
});

describe('ClaudeCodeAdapter.run — wall-clock timeout', () => {
  it('returns status=timeout when timeoutMs trips before the slow fixture finishes', async () => {
    const adapter = mkAdapter(fx('claude-slow.json'));
    const result = await adapter.run({
      prompt: 'p',
      workdir,
      timeoutMs: 1_000,
    });
    expect(result.status).toBe('timeout');
    // Bug-test "no zombie process": the adapter awaited spawned.exit, so the child
    // is reaped by the time run() resolves. Verified at the spawned-child API level.
    expect(() => RunResultSchema.parse(result)).not.toThrow();
  }, 15_000);
});

describe('ClaudeCodeAdapter.run ??process failure', () => {
  it('returns status=failed when the CLI exits non-zero', async () => {
    const adapter = mkAdapter(fx('claude-nonzero.json'));
    const result = await adapter.run({ prompt: 'p', workdir });
    expect(result.status).toBe('failed');
    expect(() => RunResultSchema.parse(result)).not.toThrow();
  });
});

describe('ClaudeCodeAdapter.cost', () => {
  it('uses the rate_table to convert usage to USD', () => {
    const adapter = mkAdapter(fx('claude-normal.json'));
    const c = adapter.cost({ tokensIn: 200, tokensOut: 300, model: 'test-model' });
    expect(c.usd).toBeCloseTo(0.5);
  });
});
