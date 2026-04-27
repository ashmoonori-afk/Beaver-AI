// Lighter-weight tests for `beaver run`: verifies the v0.1 flag policy
// (--server stub, missing goal) and the one-active-run rule against a
// pre-seeded ledger. The full E2E (which actually spawns the orchestrator)
// is exercised by beaver-ai/api.test.ts; replicating it here would re-test
// the library, not the CLI surface.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, insertProject, insertRun, openDb, runMigrations } from '@beaver-ai/core';

import { setColorOverride } from '../../render/colors.js';
import { runRun } from '../run.js';

let tmpDir: string;
let origCwd: string;
let origDbEnv: string | undefined;

beforeEach(() => {
  setColorOverride(false);
  origCwd = process.cwd();
  origDbEnv = process.env['BEAVER_DB'];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-cli-run-'));
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.beaver'));
  process.env['BEAVER_DB'] = path.join(tmpDir, '.beaver', 'beaver.db');
});

afterEach(() => {
  process.chdir(origCwd);
  if (origDbEnv === undefined) delete process.env['BEAVER_DB'];
  else process.env['BEAVER_DB'] = origDbEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runRun', () => {
  it('--server prints the Phase 4 stub and exits with code 2', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runRun(['--server', 'do something']);
    expect(code).toBe(2);
    const all = errSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/Phase 4 not landed/);
    errSpy.mockRestore();
  });

  it('missing goal exits with code 2', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runRun([]);
    expect(code).toBe(2);
    errSpy.mockRestore();
  });

  it('rejects with code 1 when an active run exists in the project', async () => {
    const dbPath = process.env['BEAVER_DB']!;
    const db = openDb({ path: dbPath });
    runMigrations(db);
    const projId = `p-${path.basename(tmpDir)}`;
    insertProject(db, {
      id: projId,
      name: path.basename(tmpDir),
      root_path: tmpDir,
      created_at: new Date().toISOString(),
    });
    insertRun(db, {
      id: 'r-active',
      project_id: projId,
      goal: 'g',
      status: 'RUNNING',
      started_at: new Date().toISOString(),
      budget_usd: 20,
    });
    closeDb(db);

    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runRun(['--no-server', 'another goal']);
    expect(code).toBe(1);
    const all = errSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/already in progress/);
    errSpy.mockRestore();
  });
});
