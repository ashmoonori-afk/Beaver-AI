// Shared spawn helper for adapter implementations (Claude Code, Codex, ...).
// Pure plumbing — no parsing, no event translation, no kill semantics.
// Per-provider stream parsing lives in <provider>/parse.ts.

import { spawn, type ChildProcess } from 'node:child_process';

export interface SpawnAdapterOptions {
  /** Path to the executable (e.g. `claude`, `codex`, or process.execPath
   *  for tests pointing at mock-cli.js). */
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

export interface SpawnedAdapter {
  child: ChildProcess;
  /** Async iterable of stdout lines (newline-delimited, decoded utf-8). */
  lines: AsyncIterable<string>;
  stderr(): string;
  /** Resolves with the child's exit code (or null on signal). */
  exit: Promise<number | null>;
}

export function spawnAdapterCli(opts: SpawnAdapterOptions): SpawnedAdapter {
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
