// `beaver refine "<goal>"` — exits 0 and prints a JSON RefinementResult
// to stdout. Tests inject the mock-cli + a refinement fixture so the
// adapter spawn produces deterministic output.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, insertRate, openDb, runMigrations } from '@beaver-ai/core';

import { setColorOverride } from '../../render/colors.js';
import { runRefine } from '../refine.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const mockCliPath = path.resolve(here, '../../../../core/src/providers/_test/mock-cli.js');
const fixturePath = path.resolve(
  here,
  '../../../../core/src/providers/_test/fixtures/claude-refine.json',
);

let tmpDir: string;
let origCwd: string;
let origDbEnv: string | undefined;
let origCli: string | undefined;
let origArgs: string | undefined;

beforeEach(() => {
  setColorOverride(false);
  origCwd = process.cwd();
  origDbEnv = process.env['BEAVER_DB'];
  origCli = process.env['BEAVER_REFINE_CLI'];
  origArgs = process.env['BEAVER_REFINE_ARGS'];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-cli-refine-'));
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.beaver'));
  process.env['BEAVER_DB'] = path.join(tmpDir, '.beaver', 'beaver.db');
  // Inject mock-cli so the adapter spawns process.execPath + a fixture
  process.env['BEAVER_REFINE_CLI'] = process.execPath;
  process.env['BEAVER_REFINE_ARGS'] = JSON.stringify([mockCliPath, fixturePath]);
  // Seed the rate_table so cost() doesn't fail on the test-model row.
  const db = openDb({ path: process.env['BEAVER_DB']! });
  runMigrations(db);
  insertRate(db, {
    provider: 'claude-code',
    model: 'test-model',
    tokens_in_per_usd: 1_000_000,
    tokens_out_per_usd: 500_000,
    effective_from: '2026-01-01T00:00:00Z',
  });
  closeDb(db);
});

afterEach(() => {
  process.chdir(origCwd);
  if (origDbEnv === undefined) delete process.env['BEAVER_DB'];
  else process.env['BEAVER_DB'] = origDbEnv;
  if (origCli === undefined) delete process.env['BEAVER_REFINE_CLI'];
  else process.env['BEAVER_REFINE_CLI'] = origCli;
  if (origArgs === undefined) delete process.env['BEAVER_REFINE_ARGS'];
  else process.env['BEAVER_REFINE_ARGS'] = origArgs;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runRefine', () => {
  it('prints a parsed RefinementResult JSON and exits 0', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runRefine(['build a todo app']);
    expect(code).toBe(0);
    const stdout = outSpy.mock.calls.map((c) => String(c[0])).join('');
    const parsed = JSON.parse(stdout) as { ready: boolean; prd?: unknown; mvp?: unknown };
    expect(parsed.ready).toBe(false);
    expect(parsed.prd).toBeDefined();
    expect(parsed.mvp).toBeDefined();
    outSpy.mockRestore();
  });

  it('missing goal exits with code 2', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runRefine([]);
    expect(code).toBe(2);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('')).toMatch(/missing required <goal>/);
    errSpy.mockRestore();
  });

  it('--help exits 0 with usage', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runRefine(['--help']);
    expect(code).toBe(0);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('')).toMatch(/usage: beaver refine/);
    errSpy.mockRestore();
  });

  it('--section-edit "scope:section=text" parses correctly', async () => {
    // Smoke-test the arg parser: bad form returns 2.
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runRefine(['todo', '--section-edit', 'no-equals-here']);
    expect(code).toBe(2);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join('')).toMatch(/--section-edit/);
    errSpy.mockRestore();
  });
});
