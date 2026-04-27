import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeDb,
  getCheckpoint,
  insertProject,
  insertRun,
  openDb,
  post,
  runMigrations,
} from '@beaver-ai/core';

import { setColorOverride } from '../../render/colors.js';
import { runAnswer } from '../answer.js';

let tmpDir: string;
let origCwd: string;
let origDbEnv: string | undefined;
let cpId: string;

beforeEach(() => {
  setColorOverride(false);
  origCwd = process.cwd();
  origDbEnv = process.env['BEAVER_DB'];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-cli-ans-'));
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
    id: 'r-1',
    project_id: 'p-1',
    goal: 'g',
    status: 'RUNNING',
    started_at: '2026-01-01T00:00:00Z',
    budget_usd: 20,
  });
  cpId = post(db, { kind: 'plan-approval', runId: 'r-1', prompt: 'q' }).id;
  closeDb(db);
});

afterEach(() => {
  process.chdir(origCwd);
  if (origDbEnv === undefined) delete process.env['BEAVER_DB'];
  else process.env['BEAVER_DB'] = origDbEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runAnswer', () => {
  it('writes a valid response and the row flips to answered', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runAnswer([cpId, 'approve']);
    expect(code).toBe(0);
    const db = openDb({ path: process.env['BEAVER_DB']! });
    const row = getCheckpoint(db, cpId);
    closeDb(db);
    expect(row?.status).toBe('answered');
    expect(row?.response).toBe('approve');
    outSpy.mockRestore();
  });

  it('returns 1 with an actionable message for unknown id', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runAnswer(['nope', 'approve']);
    expect(code).toBe(1);
    const all = errSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/no such checkpoint/);
    errSpy.mockRestore();
  });
});
