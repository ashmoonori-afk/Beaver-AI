import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, insertProject, insertRun, openDb, runMigrations } from '@beaver-ai/core';

import { setColorOverride } from '../../render/colors.js';
import { runStatus } from '../status.js';

let tmpDir: string;
let origCwd: string;
let origDbEnv: string | undefined;

beforeEach(() => {
  setColorOverride(false);
  origCwd = process.cwd();
  origDbEnv = process.env['BEAVER_DB'];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-cli-status-'));
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.beaver'));
  process.env['BEAVER_DB'] = path.join(tmpDir, '.beaver', 'beaver.db');
  const db = openDb({ path: process.env['BEAVER_DB']! });
  runMigrations(db);
  closeDb(db);
});

afterEach(() => {
  process.chdir(origCwd);
  if (origDbEnv === undefined) delete process.env['BEAVER_DB'];
  else process.env['BEAVER_DB'] = origDbEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runStatus', () => {
  it('reports no runs when ledger empty', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runStatus([]);
    expect(code).toBe(0);
    const all = outSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/no runs/);
    outSpy.mockRestore();
  });

  it('renders the status line for the most recent run', async () => {
    const db = openDb({ path: process.env['BEAVER_DB']! });
    const projId = `p-${path.basename(tmpDir)}`;
    insertProject(db, {
      id: projId,
      name: path.basename(tmpDir),
      root_path: tmpDir,
      created_at: '2026-01-01T00:00:00Z',
    });
    insertRun(db, {
      id: 'r-1',
      project_id: projId,
      goal: 'do thing',
      status: 'RUNNING',
      started_at: new Date().toISOString(),
      budget_usd: 20,
    });
    closeDb(db);

    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runStatus([]);
    expect(code).toBe(0);
    const all = outSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/\[RUNNING\]/);
    expect(all).toMatch(/r-1/);
    outSpy.mockRestore();
  });
});
