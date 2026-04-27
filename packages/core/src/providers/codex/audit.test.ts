import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { listEventsByType } from '../../workspace/dao/events.js';
import { insertProject } from '../../workspace/dao/projects.js';
import { insertRun } from '../../workspace/dao/runs.js';
import { closeDb, openDb, type Db } from '../../workspace/db.js';
import { runMigrations } from '../../workspace/migrate.js';

import { filesystemAudit } from './audit.js';

let db: Db;
let workdir: string;
let outsideDir: string;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
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
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-audit-wt-'));
  outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-audit-out-'));
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(workdir, { recursive: true, force: true });
  fs.rmSync(outsideDir, { recursive: true, force: true });
});

describe('filesystemAudit', () => {
  it('emits agent.shell.bypass-attempt for a marker file outside the worktree', () => {
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    const marker = path.join(outsideDir, 'leaked.txt');
    fs.writeFileSync(marker, 'leaked by an absolute-path bypass');

    const r = filesystemAudit(db, {
      worktree: workdir,
      runId: 'r1',
      source: 'codex-audit',
      runStartedAt: startedAt,
      scanPaths: [outsideDir],
    });

    expect(r.bypassAttempts).toHaveLength(1);
    expect(r.bypassAttempts[0]).toContain('leaked.txt');

    const events = listEventsByType(db, 'r1', 'agent.shell.bypass-attempt');
    expect(events).toHaveLength(1);
    const payload = JSON.parse(events[0]!.payload_json ?? '{}');
    expect(payload.file).toContain('leaked.txt');
    expect(typeof payload.mtimeMs).toBe('number');
  });

  it('ignores files inside the worktree even if scan path includes a parent', () => {
    const startedAt = new Date(Date.now() - 1_000).toISOString();
    const insideMarker = path.join(workdir, 'normal.txt');
    fs.writeFileSync(insideMarker, 'expected agent output');

    const parentDir = path.dirname(workdir);
    const r = filesystemAudit(db, {
      worktree: workdir,
      runId: 'r1',
      source: 'codex-audit',
      runStartedAt: startedAt,
      scanPaths: [parentDir],
    });

    // workdir and outsideDir share the same os.tmpdir() parent, so other test
    // tmpdirs may show up as bypass attempts. The point of this case is that
    // OUR insideMarker is not in the bypassAttempts list.
    expect(r.bypassAttempts.find((p) => p.includes('normal.txt'))).toBeUndefined();
  });

  it('ignores files older than runStartedAt', () => {
    const oldFile = path.join(outsideDir, 'old.txt');
    fs.writeFileSync(oldFile, 'pre-run content');
    // Backdate mtime by 10 seconds
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    fs.utimesSync(oldFile, tenSecondsAgo, tenSecondsAgo);

    const startedAt = new Date(Date.now() - 5_000).toISOString();
    const r = filesystemAudit(db, {
      worktree: workdir,
      runId: 'r1',
      source: 'codex-audit',
      runStartedAt: startedAt,
      scanPaths: [outsideDir],
    });

    expect(r.bypassAttempts).toEqual([]);
    const events = listEventsByType(db, 'r1', 'agent.shell.bypass-attempt');
    expect(events).toHaveLength(0);
  });

  it('returns empty result when scanPaths do not exist', () => {
    const r = filesystemAudit(db, {
      worktree: workdir,
      runId: 'r1',
      source: 'codex-audit',
      runStartedAt: new Date().toISOString(),
      scanPaths: [path.join(outsideDir, 'no-such-subdir')],
    });
    expect(r.bypassAttempts).toEqual([]);
  });
});
