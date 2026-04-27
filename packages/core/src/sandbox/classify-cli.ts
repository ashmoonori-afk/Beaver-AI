// Tiny stdin → exit-code wrapper around classify(). Spawned by the
// POSIX shim scripts in providers/codex/shim/* via:
//   node --import=tsx classify-cli.ts
//
// Reads:  cmd string from stdin (UTF-8, leading/trailing whitespace OK).
// Reads:  BEAVER_CWD (defaults to process.cwd()), BEAVER_WORKTREE (req).
// Writes: short verdict line to stdout (verdict + reason + patternId).
// Exits:  0 = allow, 1 = require-confirmation, 2 = hard-deny.
//
// Pure I/O: imports only classify so the shim has no transitive DB pull.

import { classify } from './classify.js';

const ALLOW = 0;
const REQUIRE_CONFIRM = 1;
const HARD_DENY = 2;

function exitFor(verdict: 'allow' | 'require-confirmation' | 'hard-deny'): number {
  if (verdict === 'allow') return ALLOW;
  if (verdict === 'require-confirmation') return REQUIRE_CONFIRM;
  return HARD_DENY;
}

async function main(): Promise<number> {
  const worktree = process.env.BEAVER_WORKTREE;
  const cwd = process.env.BEAVER_CWD ?? process.cwd();
  if (!worktree) {
    process.stderr.write('classify-cli: BEAVER_WORKTREE env var required\n');
    return HARD_DENY;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const cmd = Buffer.concat(chunks).toString('utf8');

  const result = classify(cmd, cwd, worktree);
  const idPart = result.patternId ? ` patternId=${result.patternId}` : '';
  process.stdout.write(`${result.verdict}: ${result.reason}${idPart}\n`);
  return exitFor(result.verdict);
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`classify-cli: unhandled: ${(e as Error).message}\n`);
    process.exit(HARD_DENY);
  });
