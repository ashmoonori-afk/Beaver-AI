// Spawn the Claude Code CLI as a child process and yield its stdout
// as one string per line (newline-delimited).
//
// Pure plumbing — no parsing, no event translation, no kill semantics.
// (P1.S2 spaghetti: spawn / parse / kill live in three separate files.)

import { spawn, type ChildProcess } from 'node:child_process';

export interface SpawnClaudeOptions {
  /** Path to the executable. In production this is `claude`; tests pass
   *  `process.execPath` (node) and an args list pointing to mock-cli.js. */
  cliPath: string;
  /** Args passed after cliPath. */
  args?: string[];
  /** Working directory for the child. */
  cwd?: string;
  /** Optional env map merged onto process.env. */
  env?: NodeJS.ProcessEnv;
  /** Bytes to write to the child's stdin. stdin is closed after. */
  stdin?: string;
  /** Caller-supplied AbortSignal. The adapter wires this to a kill. */
  signal?: AbortSignal;
}

export interface SpawnedClaude {
  child: ChildProcess;
  /** Async iterable of stdout lines (newline-delimited, decoded utf-8). */
  lines: AsyncIterable<string>;
  stderr(): string;
  /** Resolves with the child's exit code (or null on signal). */
  exit: Promise<number | null>;
}

export function spawnClaudeCli(opts: SpawnClaudeOptions): SpawnedClaude {
  const child = spawn(opts.cliPath, opts.args ?? [], {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(opts.signal !== undefined && { signal: opts.signal }),
  });

  if (opts.stdin !== undefined) child.stdin?.write(opts.stdin);
  child.stdin?.end();

  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));

  const exit = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
  });

  async function* lineStream(): AsyncIterable<string> {
    let buf = '';
    for await (const chunk of child.stdout ?? []) {
      buf += (chunk as Buffer).toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.length > 0) yield line;
      }
    }
    if (buf.length > 0) yield buf;
  }

  return {
    child,
    lines: lineStream(),
    stderr: () => Buffer.concat(stderrChunks).toString('utf8'),
    exit,
  };
}
