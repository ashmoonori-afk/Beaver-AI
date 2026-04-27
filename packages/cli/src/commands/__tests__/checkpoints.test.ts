import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, insertProject, insertRun, openDb, post, runMigrations } from '@beaver-ai/core';

import { setColorOverride } from '../../render/colors.js';
import { runCheckpoints } from '../checkpoints.js';

let tmpDir: string;
let origCwd: string;
let origDbEnv: string | undefined;

beforeEach(() => {
  setColorOverride(false);
  origCwd = process.cwd();
  origDbEnv = process.env['BEAVER_DB'];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-cli-cps-'));
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.beaver'));
  process.env['BEAVER_DB'] = path.join(tmpDir, '.beaver', 'beaver.db');
  const db = openDb({ path: process.env['BEAVER_DB']! });
  runMigrations(db);
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
    goal: 'g',
    status: 'RUNNING',
    started_at: '2026-01-01T00:00:00Z',
    budget_usd: 20,
  });
  closeDb(db);
});

afterEach(() => {
  process.chdir(origCwd);
  if (origDbEnv === undefined) delete process.env['BEAVER_DB'];
  else process.env['BEAVER_DB'] = origDbEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runCheckpoints', () => {
  it('reports zero pending when none exist', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runCheckpoints([]);
    expect(code).toBe(0);
    const all = outSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/0 pending/);
    outSpy.mockRestore();
  });

  it('renders pending checkpoints via the unified frame', async () => {
    const db = openDb({ path: process.env['BEAVER_DB']! });
    post(db, { kind: 'plan-approval', runId: 'r-1', prompt: 'approve plan?' });
    closeDb(db);

    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runCheckpoints([]);
    expect(code).toBe(0);
    const all = outSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/checkpoint: plan-approval/);
    expect(all).toMatch(/approve plan\?/);
    outSpy.mockRestore();
  });
});
