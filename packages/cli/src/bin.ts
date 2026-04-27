#!/usr/bin/env node
// CLI entry point. Parses argv, strips global flags, dispatches to a
// subcommand handler, then exits with the handler's return code.

import { COMMAND_NAMES, COMMANDS } from './commands/index.js';
import { setColorOverride } from './render/colors.js';

function printUsage(stream: NodeJS.WriteStream): void {
  const cmds = COMMAND_NAMES.join(' | ');
  stream.write(`usage: beaver <${cmds}> [options]\n`);
}

async function main(argv: string[]): Promise<number> {
  // Filter out global flags so subcommand parsers don't see them.
  const rest: string[] = [];
  for (const a of argv) {
    if (a === '--no-color') {
      setColorOverride(false);
      continue;
    }
    rest.push(a);
  }

  const sub = rest[0];
  if (!sub || sub === '--help' || sub === '-h') {
    printUsage(process.stdout);
    return 0;
  }
  const handler = COMMANDS[sub];
  if (!handler) {
    process.stderr.write(`beaver: unknown subcommand '${sub}'\n`);
    printUsage(process.stderr);
    return 2;
  }
  return handler(rest.slice(1));
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    process.stderr.write(`beaver: fatal: ${(err as Error).message}\n`);
    process.exit(1);
  });
