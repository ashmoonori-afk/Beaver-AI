// `beaver status` — summary of the active or most recent run.

import path from 'node:path';

import { Command } from 'commander';

import { listPendingCheckpoints, listRunsByProject } from '@beaver-ai/core';

import { color } from '../render/colors.js';
import { formatStatusLine } from '../render/status-line.js';
import { printerr, println, withDb } from './_shared.js';

function projectIdFor(rootPath: string): string {
  return `p-${path.basename(rootPath)}`;
}

export async function runStatus(argv: string[]): Promise<number> {
  const cmd = new Command('status')
    .description('show the active or most recent run')
    .exitOverride();
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`status: ${(e as Error).message}`);
    return 2;
  }

  return withDb(async (db) => {
    const projId = projectIdFor(process.cwd());
    const rows = listRunsByProject(db, projId);
    if (rows.length === 0) {
      println(color.dim('status: no runs in this project'));
      return 0;
    }
    const run = rows[rows.length - 1]!;
    const open = listPendingCheckpoints(db, run.id).length;
    const elapsedMs = run.ended_at
      ? new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()
      : Date.now() - new Date(run.started_at).getTime();
    println(
      formatStatusLine({
        state: run.status.toLowerCase(),
        runningTasks: 0,
        totalTasks: 0,
        spentUsd: run.spent_usd,
        elapsedMs,
        openCheckpoints: open,
      }),
    );
    println(color.dim(`run: ${run.id} · goal: ${run.goal}`));
    return 0;
  });
}
