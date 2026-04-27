// `beaver answer <id> <response>` — write an answer to a pending checkpoint.

import { Command } from 'commander';

import { answer } from '@beaver-ai/core';

import { color } from '../render/colors.js';
import { printerr, println, withDb } from './_shared.js';

export async function runAnswer(argv: string[]): Promise<number> {
  const cmd = new Command('answer')
    .description('answer a pending checkpoint')
    .argument('<id>', 'checkpoint id')
    .argument('<response>', 'response string (kind-specific)')
    .exitOverride();
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`answer: ${(e as Error).message}`);
    return 2;
  }
  const id = cmd.args[0];
  const response = cmd.args[1];
  if (!id || response === undefined) {
    printerr('answer: missing arguments');
    return 2;
  }

  return withDb(async (db) => {
    try {
      answer(db, id, response);
      println(color.success(`answer: ${id} ← ${response}`));
      return 0;
    } catch (e) {
      printerr(color.error(`answer: ${(e as Error).message}`));
      return 1;
    }
  });
}
