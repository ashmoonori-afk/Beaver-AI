// PreToolUse hook executable. Spawned by Claude Code (and by the
// adapter-level smoke tests) BEFORE every shell tool call.
//
// Run with `node --import=tsx hook.ts`. tsx resolves the `.js`-style
// relative imports inside the dependency chain against the .ts source —
// Node's plain --experimental-strip-types does not, because internal
// imports follow the NodeNext .js convention. Production deployment
// (bundle vs ship-as-source) is a P1.S3 followup.
//
// Reads:  JSON {tool, input} from stdin.
// Reads:  BEAVER_DB_PATH, BEAVER_RUN_ID, BEAVER_WORKTREE, BEAVER_CWD env.
// Writes: agent.shell.classify or agent.shell.denied event row, plus a
//         risky-change-confirmation checkpoint row when applicable.
// Exits:  0 = allow, 2 = deny.

import { HookInputSchema, runHook } from './hook-core.js';

const DEFAULT_DENY_EXIT = 2;

async function main(): Promise<number> {
  const dbPath = process.env.BEAVER_DB_PATH;
  const runId = process.env.BEAVER_RUN_ID;
  const worktree = process.env.BEAVER_WORKTREE;
  const cwd = process.env.BEAVER_CWD ?? process.cwd();
  if (!dbPath || !runId || !worktree) {
    process.stderr.write(
      'hook: BEAVER_DB_PATH / BEAVER_RUN_ID / BEAVER_WORKTREE env vars required\n',
    );
    return DEFAULT_DENY_EXIT;
  }

  const stdinChunks: Buffer[] = [];
  for await (const chunk of process.stdin) stdinChunks.push(chunk as Buffer);
  const stdin = Buffer.concat(stdinChunks).toString('utf8');

  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    process.stderr.write('hook: stdin not valid JSON\n');
    return DEFAULT_DENY_EXIT;
  }

  const parsed = HookInputSchema.safeParse(raw);
  if (!parsed.success) {
    process.stderr.write(`hook: invalid input: ${parsed.error.message}\n`);
    return DEFAULT_DENY_EXIT;
  }

  const result = await runHook({
    input: parsed.data,
    env: { dbPath, runId, worktree, cwd },
  });
  if (result.stderr) process.stderr.write(result.stderr + '\n');
  return result.exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    process.stderr.write(`hook: unhandled: ${(e as Error).message}\n`);
    process.exit(DEFAULT_DENY_EXIT);
  });
