// `beaver resume <run-id>` — flip a PAUSED run back to RUNNING.
//
// v0.1: writes status to RUNNING via the runs DAO. The orchestrator does the
// actual replay in P2.S5; this handler is the surface, not the engine.

import { Command } from 'commander';

import { getRun, updateRunStatus } from '@beaver-ai/core';

import { color } from '../render/colors.js';
import { printerr, println, withDb } from './_shared.js';

export async function runResume(argv: string[]): Promise<number> {
  const cmd = new Command('resume')
    .description('resume a paused run')
    .argument('<run-id>', 'run id')
    .exitOverride();
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`resume: ${(e as Error).message}`);
    return 2;
  }
  const runId = cmd.args[0];
  if (!runId) {
    printerr('resume: missing <run-id>');
    return 2;
  }

  return withDb(async (db) => {
    const row = getRun(db, runId);
    if (!row) {
      printerr(color.error(`resume: no such run id='${runId}'`));
      return 1;
    }
    if (row.status === 'COMPLETED' || row.status === 'ABORTED') {
      printerr(color.error(`resume: run ${runId} is in terminal state '${row.status}'`));
      return 1;
    }
    updateRunStatus(db, runId, 'RUNNING');
    println(color.success(`resume: ${runId} → RUNNING`));
    return 0;
  });
}
