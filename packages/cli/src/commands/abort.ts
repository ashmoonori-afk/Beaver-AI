// `beaver abort <run-id>` — mark a run ABORTED.

import { Command } from 'commander';

import { getRun, updateRunStatus } from '@beaver-ai/core';

import { color } from '../render/colors.js';
import { printerr, println, withDb } from './_shared.js';

export async function runAbort(argv: string[]): Promise<number> {
  const cmd = new Command('abort')
    .description('abort a run')
    .argument('<run-id>', 'run id')
    .exitOverride();
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`abort: ${(e as Error).message}`);
    return 2;
  }
  const runId = cmd.args[0];
  if (!runId) {
    printerr('abort: missing <run-id>');
    return 2;
  }

  return withDb(async (db) => {
    const row = getRun(db, runId);
    if (!row) {
      printerr(color.error(`abort: no such run id='${runId}'`));
      return 1;
    }
    if (row.status === 'COMPLETED' || row.status === 'ABORTED') {
      println(color.dim(`abort: ${runId} already in terminal state '${row.status}'`));
      return 0;
    }
    updateRunStatus(db, runId, 'ABORTED');
    println(color.success(`abort: ${runId} → ABORTED`));
    return 0;
  });
}
