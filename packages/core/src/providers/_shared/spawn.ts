// Shared spawn helper for adapter implementations (Claude Code, Codex, ...).
// Pure plumbing — no parsing, no event translation, no kill semantics.
// Per-provider stream parsing lives in <provider>/parse.ts.

import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

export interface SpawnTarget {
  command: string;
  argsPrefix: string[];
}

export function resolveSpawnTarget(cliPath: string): SpawnTarget {
  if (process.platform !== 'win32') return { command: cliPath, argsPrefix: [] };
  if (path.isAbsolute(cliPath)) return { command: cliPath, argsPrefix: [] };
  if (cliPath.includes('\\') || cliPath.includes('/')) return { command: cliPath, argsPrefix: [] };
  if (path.extname(cliPath).length > 0) return { command: cliPath, argsPrefix: [] };

  const shim = findOnPath(`${cliPath}.cmd`);
  const npmTarget = shim ? resolveKnownNpmShim(cliPath, shim) : null;
  if (npmTarget) return npmTarget;
  return { command: `${cliPath}.cmd`, argsPrefix: [] };
}

export function resolveSpawnCommand(cliPath: string): string {
  return resolveSpawnTarget(cliPath).command;
}

export function spawnAdapterCli(opts: SpawnAdapterOptions): SpawnedAdapter {
  const target = resolveSpawnTarget(opts.cliPath);
  const child = spawn(target.command, [...target.argsPrefix, ...(opts.args ?? [])], {
    cwd: opts.cwd,
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdio: [opts.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    ...(opts.signal !== undefined && { signal: opts.signal }),
  });

  if (opts.stdin !== undefined) {
    child.stdin?.write(opts.stdin);
    child.stdin?.end();
  }

  const stderrChunks: Buffer[] = [];
  child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));

  const exit = new Promise<number | null>((resolve) => {
    child.once('error', () => resolve(127));
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

function findOnPath(fileName: string): string | null {
  const pathEnv = process.env.PATH ?? '';
  for (const dir of pathEnv.split(path.delimiter)) {
    if (dir.length === 0) continue;
    const candidate = path.join(dir, fileName);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function resolveKnownNpmShim(cliPath: string, shimPath: string): SpawnTarget | null {
  const baseDir = path.dirname(shimPath);
  if (cliPath === 'claude') {
    const exe = path.join(
      baseDir,
      'node_modules',
      '@anthropic-ai',
      'claude-code',
      'bin',
      'claude.exe',
    );
    if (fs.existsSync(exe)) return { command: exe, argsPrefix: [] };
  }
  if (cliPath === 'codex') {
    const js = path.join(baseDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (fs.existsSync(js)) return { command: process.execPath, argsPrefix: [js] };
  }
  return null;
}
