// Post-run filesystem audit for the Codex agent path.
//
// The PATH shim (P1.S4 T2) cannot see absolute paths or `system()` calls,
// so a process that bypasses the shim (`/bin/rm`, etc.) leaves the policy
// engine blind in real time. After each Codex run, we walk the configured
// scanPaths and any file with mtime >= runStartedAt that is NOT under
// the agent's worktree is recorded as `agent.shell.bypass-attempt` so
// the orchestrator can require user confirmation before approving the run.

import fs from 'node:fs';
import path from 'node:path';

import { insertEvent } from '../../workspace/dao/events.js';
import type { Db } from '../../workspace/db.js';

export interface FilesystemAuditOptions {
  /** Agent's worktree root. Files inside (or equal to) are not bypasses. */
  worktree: string;
  /** Run id used on the resulting event rows. */
  runId: string;
  /** Source label on the event rows (e.g. 'codex-audit'). */
  source: string;
  /** ISO 8601 — files with mtime >= this are flagged. */
  runStartedAt: string;
  /** Directories to walk. Files outside `worktree` modified after
   *  `runStartedAt` become bypass attempts. */
  scanPaths: string[];
}

export interface AuditResult {
  bypassAttempts: string[];
}

export function filesystemAudit(db: Db, opts: FilesystemAuditOptions): AuditResult {
  const startedMs = new Date(opts.runStartedAt).getTime();
  const worktreeAbs = path.resolve(opts.worktree);
  const bypassAttempts: string[] = [];

  for (const scanPath of opts.scanPaths) {
    walk(scanPath, (file) => {
      const abs = path.resolve(file);
      if (abs === worktreeAbs || abs.startsWith(worktreeAbs + path.sep)) return;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        return;
      }
      if (!stat.isFile() || stat.mtimeMs < startedMs) return;
      bypassAttempts.push(abs);
      insertEvent(db, {
        run_id: opts.runId,
        ts: new Date().toISOString(),
        source: opts.source,
        type: 'agent.shell.bypass-attempt',
        payload_json: JSON.stringify({ file: abs, mtimeMs: stat.mtimeMs }),
      });
    });
  }
  return { bypassAttempts };
}

function walk(dir: string, visit: (file: string) => void): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, visit);
    else if (entry.isFile()) visit(full);
  }
}
