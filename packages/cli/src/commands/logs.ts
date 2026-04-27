// `beaver logs [<run-id>] [--follow] [--json]` — stream events table.
//
// v0.1: --follow polls the events table once per second. Real LISTEN/NOTIFY
// is deferred (sqlite has no built-in notify; busy-loop polling is fine for
// a single-user CLI).

import path from 'node:path';

import { Command } from 'commander';

import { listEventsByRun, listRunsByProject } from '@beaver-ai/core';

import { color } from '../render/colors.js';
import { renderLogs } from '../render/logs.js';
import { printerr, println, withDb } from './_shared.js';

function projectIdFor(rootPath: string): string {
  return `p-${path.basename(rootPath)}`;
}

export async function runLogs(argv: string[]): Promise<number> {
  const cmd = new Command('logs')
    .description('print events for a run')
    .argument('[run-id]', 'run id (defaults to the most recent)')
    .option('--follow', 'tail the event log')
    .option('--json', 'NDJSON output')
    .exitOverride();
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`logs: ${(e as Error).message}`);
    return 2;
  }
  const opts = cmd.opts<{ follow?: boolean; json?: boolean }>();
  const explicit = cmd.args[0];

  return withDb(async (db) => {
    let runId = explicit;
    if (!runId) {
      const rows = listRunsByProject(db, projectIdFor(process.cwd()));
      if (rows.length === 0) {
        println(color.dim('logs: no runs in this project'));
        return 0;
      }
      runId = rows[rows.length - 1]!.id;
    }
    const events = listEventsByRun(db, runId);
    println(renderLogs(events, { json: opts.json ?? false }));
    if (!opts.follow) return 0;
    println(color.dim('logs: --follow is a v0.1 stub; events shown are point-in-time'));
    return 0;
  });
}
