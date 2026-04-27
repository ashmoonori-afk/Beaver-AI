// Library API E2E test using a mock-cli-driven ClaudeCodeAdapter.
// Verifies a goal flows through PLANNING -> EXECUTING -> REVIEWING ->
// FINAL_REVIEW_PENDING -> COMPLETED end-to-end without any real LLM CLI.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  ClaudeCodeAdapter,
  CodexAdapter,
  insertRate,
  openDb,
  closeDb,
  runMigrations,
} from '@beaver-ai/core';

import { Beaver, providerForGoal } from './api.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', '..', 'core', 'src', 'providers', '_test', 'mock-cli.js');
const FX_DIR = path.join(HERE, '..', '..', 'core', 'src', 'providers', '_test', 'fixtures');

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-api-'));
  dbPath = path.join(tmpDir, '.beaver', 'beaver.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = openDb({ path: dbPath });
  runMigrations(db);
  insertRate(db, {
    provider: 'claude-code',
    model: 'test-model',
    tokens_in_per_usd: 1_000_000,
    tokens_out_per_usd: 1_000_000,
    effective_from: '2026-01-01T00:00:00Z',
  });
  insertRate(db, {
    provider: 'codex',
    model: 'codex-test',
    tokens_in_per_usd: 1_000_000,
    tokens_out_per_usd: 1_000_000,
    effective_from: '2026-01-01T00:00:00Z',
  });
  closeDb(db);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Beaver.run() E2E (mock-cli driven)', () => {
  it('drives a goal to COMPLETED with auto-approved final-review', async () => {
    const db = openDb({ path: dbPath });
    try {
      const adapter = new ClaudeCodeAdapter({
        cliPath: process.execPath,
        defaultArgs: [MOCK_CLI, path.join(FX_DIR, 'claude-normal.json')],
        db,
        providerForRate: 'claude-code',
      });
      // Re-seed under test-model so adapter.cost() works (claude-normal.json
      // emits usage with model='test-model').
      const beaver = new Beaver({
        rootPath: tmpDir,
        dbPath,
        claudeAdapter: adapter,
      });
      const r = await beaver.run({ goal: 'create hello.txt with body hi' });
      expect(r.runId).toMatch(/^r-/);
      expect(r.provider).toBe('claude-code');
      // Auto-approver should drive us to COMPLETED.
      expect(r.finalState).toBe('COMPLETED');
    } finally {
      closeDb(db);
    }
  }, 30_000);

  it('routes frontend/web goals to Codex', async () => {
    expect(providerForGoal('build a web html css landing page')).toBe('codex');
    expect(providerForGoal('백엔드 API 서버를 만들어줘')).toBe('claude-code');

    const db = openDb({ path: dbPath });
    try {
      const codexAdapter = new CodexAdapter({
        cliPath: process.execPath,
        defaultArgs: [MOCK_CLI, path.join(FX_DIR, 'codex-normal.json')],
        db,
        providerForRate: 'codex',
      });
      const beaver = new Beaver({
        rootPath: tmpDir,
        dbPath,
        codexAdapter,
      });
      const r = await beaver.run({ goal: 'build a web html css landing page' });
      expect(r.provider).toBe('codex');
      expect(r.finalState).toBe('COMPLETED');
    } finally {
      closeDb(db);
    }
  }, 30_000);

  it('falls back from Codex to Claude when codex stream emits a usage-limit error', async () => {
    const db = openDb({ path: dbPath });
    try {
      const codexAdapter = new CodexAdapter({
        cliPath: process.execPath,
        defaultArgs: [MOCK_CLI, path.join(FX_DIR, 'codex-usage-limit.json')],
        db,
        providerForRate: 'codex',
      });
      const claudeAdapter = new ClaudeCodeAdapter({
        cliPath: process.execPath,
        defaultArgs: [MOCK_CLI, path.join(FX_DIR, 'claude-normal.json')],
        db,
        providerForRate: 'claude-code',
      });
      const beaver = new Beaver({
        rootPath: tmpDir,
        dbPath,
        codexAdapter,
        claudeAdapter,
      });
      // Frontend goal -> auto-routed to codex first, fails on usage-limit,
      // automatic retry on claude-code.
      const r = await beaver.run({ goal: 'build a web html landing page' });
      expect(r.provider).toBe('claude-code');
      expect(r.fallbackFrom).toMatch(/^r-/);
      expect(r.finalState).toBe('COMPLETED');
    } finally {
      closeDb(db);
    }
  }, 30_000);

  it('does not fall back when BEAVER_NO_FALLBACK=1', async () => {
    const prev = process.env.BEAVER_NO_FALLBACK;
    process.env.BEAVER_NO_FALLBACK = '1';
    try {
      const db = openDb({ path: dbPath });
      try {
        const codexAdapter = new CodexAdapter({
          cliPath: process.execPath,
          defaultArgs: [MOCK_CLI, path.join(FX_DIR, 'codex-usage-limit.json')],
          db,
          providerForRate: 'codex',
        });
        const beaver = new Beaver({
          rootPath: tmpDir,
          dbPath,
          codexAdapter,
        });
        const r = await beaver.run({ goal: 'build a web html landing page' });
        expect(r.provider).toBe('codex');
        expect(r.finalState).toBe('FAILED');
        expect(r.fallbackFrom).toBeUndefined();
      } finally {
        closeDb(db);
      }
    } finally {
      if (prev === undefined) delete process.env.BEAVER_NO_FALLBACK;
      else process.env.BEAVER_NO_FALLBACK = prev;
    }
  }, 30_000);
});
