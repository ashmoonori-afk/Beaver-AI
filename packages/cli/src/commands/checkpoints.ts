// `beaver checkpoints [<run-id>]` — list pending checkpoints.

import path from 'node:path';

import { Command } from 'commander';

import { CheckpointKindSchema, listRunsByProject, pendingFor } from '@beaver-ai/core';

import { color } from '../render/colors.js';
import { renderCheckpoint } from '../render/checkpoint.js';
import { printerr, println, withDb } from './_shared.js';

function projectIdFor(rootPath: string): string {
  return `p-${path.basename(rootPath)}`;
}

export async function runCheckpoints(argv: string[]): Promise<number> {
  const cmd = new Command('checkpoints')
    .description('list pending checkpoints')
    .argument('[run-id]', 'run id (defaults to the most recent)')
    .exitOverride();
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`checkpoints: ${(e as Error).message}`);
    return 2;
  }
  const explicit = cmd.args[0];

  return withDb(async (db) => {
    let runId = explicit;
    if (!runId) {
      const rows = listRunsByProject(db, projectIdFor(process.cwd()));
      if (rows.length === 0) {
        println(color.dim('checkpoints: no runs in this project'));
        return 0;
      }
      runId = rows[rows.length - 1]!.id;
    }
    const open = pendingFor(db, runId);
    if (open.length === 0) {
      println(color.dim(`checkpoints: 0 pending for run ${runId}`));
      return 0;
    }
    for (const cp of open) {
      println(
        renderCheckpoint({
          kind: CheckpointKindSchema.parse(cp.kind),
          prompt: cp.prompt,
          header: { runId: cp.run_id, spentUsd: 0, elapsedMs: 0, context: `id ${cp.id}` },
        }),
      );
      println('');
    }
    return 0;
  });
}
