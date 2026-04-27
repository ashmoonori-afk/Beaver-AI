// Subcommand registry. Maps subcommand name → handler.
//
// Every handler has the same shape: (args) => Promise<exitCode>. bin.ts uses
// this map to dispatch and propagate the exit code. Adding a subcommand =
// adding one entry here + one file under ./commands/.

import { runAbort } from './abort.js';
import { runAnswer } from './answer.js';
import { runCheckpoints } from './checkpoints.js';
import { runInit } from './init.js';
import { runLogs } from './logs.js';
import { runResume } from './resume.js';
import { runRun } from './run.js';
import { runStatus } from './status.js';

export type CommandHandler = (args: string[]) => Promise<number>;

export const COMMANDS: Record<string, CommandHandler> = {
  init: runInit,
  run: runRun,
  status: runStatus,
  logs: runLogs,
  checkpoints: runCheckpoints,
  answer: runAnswer,
  resume: runResume,
  abort: runAbort,
};

export const COMMAND_NAMES = Object.keys(COMMANDS);
