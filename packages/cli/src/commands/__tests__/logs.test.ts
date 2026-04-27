import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeDb,
  insertEvent,
  insertProject,
  insertRun,
  openDb,
  runMigrations,
} from '@beaver-ai/core';

import { setColorOverride } from '../../render/colors.js';
import { runLogs } from '../logs.js';

let tmpDir: string;
let origCwd: string;
let origDbEnv: string | undefined;

beforeEach(() => {
  setColorOverride(false);
  origCwd = process.cwd();
  origDbEnv = process.env['BEAVER_DB'];
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-cli-logs-'));
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
  insertEvent(db, {
    run_id: 'r-1',
    ts: '2026-04-27T10:11:12Z',
    source: 'orchestrator',
    type: 'state',
    payload_json: JSON.stringify({ message: 'EXECUTING' }),
  });
  closeDb(db);
});

afterEach(() => {
  process.chdir(origCwd);
  if (origDbEnv === undefined) delete process.env['BEAVER_DB'];
  else process.env['BEAVER_DB'] = origDbEnv;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runLogs', () => {
  it('prints pretty events for the most recent run', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runLogs([]);
    expect(code).toBe(0);
    const all = outSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/orchestrator state · EXECUTING/);
    outSpy.mockRestore();
  });

  it('--json emits NDJSON that parses', async () => {
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runLogs(['--json']);
    expect(code).toBe(0);
    const out = outSpy.mock.calls.map((c) => String(c[0])).join('');
    const lines = out.split('\n').filter((l) => l.startsWith('{'));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const parsed: unknown = JSON.parse(l);
      expect(parsed).toMatchObject({ run_id: 'r-1' });
    }
    outSpy.mockRestore();
  });
});
