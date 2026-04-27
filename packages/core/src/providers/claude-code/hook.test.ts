// Spawn-based E2E test for hook.ts. The script is invoked via
//   node --experimental-strip-types hook.ts
// to mirror how Claude Code (or the adapter) will run it. We verify the
// exit code and the DB rows the hook leaves behind.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { listEventsByRun } from '../../workspace/dao/events.js';
import { insertProject } from '../../workspace/dao/projects.js';
import { insertRun } from '../../workspace/dao/runs.js';
import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK_SCRIPT = path.join(HERE, 'hook.ts');

interface SpawnHookResult {
  exitCode: number;
  stderr: string;
}

function spawnHook(input: unknown, env: NodeJS.ProcessEnv): Promise<SpawnHookResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import=tsx', '--no-warnings', HOOK_SCRIPT], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    const errChunks: Buffer[] = [];
    child.stderr.on('data', (c: Buffer) => errChunks.push(c));
    child.on('error', reject);
    child.on('exit', (code) =>
      resolve({ exitCode: code ?? -1, stderr: Buffer.concat(errChunks).toString('utf8') }),
    );
  });
}

let tmpDir: string;
let dbPath: string;
let db: Db;

const WT = '/repo/.beaver/worktrees/agent-1';

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-hook-e2e-'));
  dbPath = path.join(tmpDir, 'beaver.db');
  db = openDb({ path: dbPath });
  runMigrations(db);
  insertProject(db, {
    id: 'p1',
    name: 'p',
    root_path: '/repo',
    created_at: '2026-04-27T00:00:00Z',
  });
  insertRun(db, {
    id: 'r1',
    project_id: 'p1',
    goal: 'g',
    status: 'RUNNING',
    started_at: '2026-04-27T00:00:00Z',
    budget_usd: 20,
  });
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('hook.ts (spawned subprocess)', () => {
  it('rm -rf / → exit 2, agent.shell.denied event written', async () => {
    const r = await spawnHook(
      { tool: 'shell', input: { command: 'rm -rf /' } },
      { BEAVER_DB_PATH: dbPath, BEAVER_RUN_ID: 'r1', BEAVER_WORKTREE: WT, BEAVER_CWD: WT },
    );
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toContain('hard-deny');

    const events = listEventsByRun(db, 'r1');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('agent.shell.denied');
  });

  it('allowed cmd → exit 0, agent.shell.classify event written', async () => {
    const r = await spawnHook(
      { tool: 'shell', input: { command: 'pytest' } },
      { BEAVER_DB_PATH: dbPath, BEAVER_RUN_ID: 'r1', BEAVER_WORKTREE: WT, BEAVER_CWD: WT },
    );
    expect(r.exitCode).toBe(0);

    const events = listEventsByRun(db, 'r1');
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('agent.shell.classify');
  });

  it('missing env vars → exit 2 with clear stderr', async () => {
    const r = await spawnHook({ tool: 'shell', input: { command: 'ls' } }, {});
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/BEAVER_DB_PATH/);
  });

  it('writes one event per call across a 5-call sequence (T4 verify)', async () => {
    const cmds = ['ls', 'pytest', 'cat README.md', 'git status', 'tsc --noEmit'];
    for (const cmd of cmds) {
      const r = await spawnHook(
        { tool: 'shell', input: { command: cmd } },
        { BEAVER_DB_PATH: dbPath, BEAVER_RUN_ID: 'r1', BEAVER_WORKTREE: WT, BEAVER_CWD: WT },
      );
      expect(r.exitCode).toBe(0);
    }
    const events = listEventsByRun(db, 'r1');
    expect(events).toHaveLength(5);
    for (const e of events) expect(e.type).toBe('agent.shell.classify');
  }, 30_000);
});
