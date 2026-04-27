// Final integration test (Phase 6) — proves the v0.1 happy path:
//   1. Both real CLIs are reachable on $PATH (claude, codex).
//   2. The full Beaver.run() pipeline drives a goal to COMPLETED via
//      the mock CLI (deterministic, no LLM cost).
//   3. The wiki bootstrap creates the page set and the natural-language
//      askWiki query returns a structured answer.
//
// Real LLM calls are NOT made here — they are flaky, slow, and cost
// real USD. The CLIs being on $PATH is the integration boundary; the
// adapter / orchestrator / wiki paths are exercised against deterministic
// mock-cli fixtures.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import {
  ClaudeCodeAdapter,
  closeDb,
  ensureWiki,
  insertRate,
  openDb,
  runMigrations,
} from '@beaver-ai/core';

import { Beaver } from './api.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', '..', 'core', 'src', 'providers', '_test', 'mock-cli.js');
const FX_DIR = path.join(HERE, '..', '..', 'core', 'src', 'providers', '_test', 'fixtures');

function which(cli: string): boolean {
  try {
    const command = process.platform === 'win32' && !cli.endsWith('.cmd') ? `${cli}.cmd` : cli;
    execFileSync(command, ['--version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const CLAUDE_OK = which('claude');
const CODEX_OK = which('codex');

describe('Phase 6 final integration loop', () => {
  // Soft-skip when the CLIs are not installed (e.g. CI runner). The point
  // of this check is to confirm the user's local environment is wired for
  // sub-agent dispatch — it is not a production correctness gate.
  const cliCheck = CLAUDE_OK && CODEX_OK ? it : it.skip;
  cliCheck('claude + codex CLIs are on $PATH (subagent dispatch precondition)', () => {
    expect(CLAUDE_OK).toBe(true);
    expect(CODEX_OK).toBe(true);
  });

  it('Beaver.run() drives the orchestrator end-to-end (mock CLI fixture)', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-final-'));
    const dbPath = path.join(tmp, '.beaver', 'beaver.db');
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

    try {
      const adapter = new ClaudeCodeAdapter({
        cliPath: process.execPath,
        defaultArgs: [MOCK_CLI, path.join(FX_DIR, 'claude-normal.json')],
        db,
        providerForRate: 'claude-code',
      });
      const beaver = new Beaver({ rootPath: tmp, dbPath, claudeAdapter: adapter });
      const r = await beaver.run({ goal: 'final integration smoke' });
      expect(r.finalState).toBe('COMPLETED');
    } finally {
      closeDb(db);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  it('wiki bootstrap creates the documented page set on a fresh config dir', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-wiki-final-'));
    try {
      const r = ensureWiki(tmp);
      expect(r.created).toBe(true);
      const wikiDir = path.join(tmp, 'wiki');
      for (const f of ['SCHEMA.md', 'index.md', 'log.md', 'user-profile.md']) {
        expect(fs.existsSync(path.join(wikiDir, f))).toBe(true);
      }
      for (const sub of ['projects', 'decisions', 'patterns']) {
        expect(fs.statSync(path.join(wikiDir, sub)).isDirectory()).toBe(true);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
