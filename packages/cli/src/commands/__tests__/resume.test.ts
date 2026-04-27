import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDb, getRun, insertProject, insertRun, openDb, runMigrations } from '@beaver-ai/core';

import { setColorOverride } from '../../render/colors.js';
import { runResume } from '../resume.js';

let tmpDir: string;
let origCwd: string;
let origDbEnv: string | undefined;

beforeEach(() => {
  setColorOverride(false);
  origCwd = process.cwd();
  origDbEnv = process.env['BEAVER_DB'];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-cli-res-'));
  process.chdir(tmpDir);
  fs.mkdirSync(path.join(tmpDir, '.beaver'));
  process.env['BEAVER_DB'] = path.join(tmpDir, '.beaver', 'beaver.db');
  const db = openDb({ path: process.env['BEAVER_DB']! });
  runMigrations(db);
  insertProject(db, {
    id: 'p-1',
    name: 'p',
    root_path: tmpDir,
    created_at: '2026-01-01T00:00:00Z',
  });
  insertRun(db, {
    id: 'r-paused',
    project_id: 'p-1',
    goal: 'g',
    status: 'PAUSED',
    started_at: '2026-01-01T00:00:00Z',
    budget_usd: 20,
  });
  insertRun(db, {
    id: 'r-done',
    project_id: 'p-1',
    goal: 'g',
    status: 'COMPLETED',
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

describe('runResume', () => {
  it('flips PAUSED → RUNNING', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runResume(['r-paused']);
    expect(code).toBe(0);
    const db = openDb({ path: process.env['BEAVER_DB']! });
    const row = getRun(db, 'r-paused');
    closeDb(db);
    expect(row?.status).toBe('RUNNING');
    outSpy.mockRestore();
  });

  it('refuses to resume a terminal run', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runResume(['r-done']);
    expect(code).toBe(1);
    errSpy.mockRestore();
  });

  it('reports unknown run id', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runResume(['nope']);
    expect(code).toBe(1);
    const all = errSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/no such run/);
    errSpy.mockRestore();
  });
});
