// Spawn-based test for classify-cli.ts. Runs:
//   node --import=tsx --no-warnings classify-cli.ts
// matching the deployment story used by the Codex shims.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'classify-cli.ts');
const WT = '/repo/.beaver/worktrees/agent-1';

interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(cmd: string, env: NodeJS.ProcessEnv = {}): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import=tsx', '--no-warnings', SCRIPT], {
      env: { ...process.env, BEAVER_WORKTREE: WT, BEAVER_CWD: WT, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.write(cmd);
    child.stdin.end();
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => err.push(c));
    child.on('error', reject);
    child.on('exit', (code) =>
      resolve({
        exitCode: code ?? -1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      }),
    );
  });
}

describe('classify-cli (spawned)', () => {
  it('allow → exit 0 (pytest)', async () => {
    const r = await runCli('pytest');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/^allow:/);
  }, 20_000);

  it('require-confirmation → exit 1 (npm install bcrypt)', async () => {
    const r = await runCli('npm install bcrypt');
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/^require-confirmation:/);
  }, 20_000);

  it('hard-deny → exit 2 (rm -rf /)', async () => {
    const r = await runCli('rm -rf /');
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toMatch(/^hard-deny:/);
  }, 20_000);

  it('empty cmd → exit 2', async () => {
    const r = await runCli('');
    expect(r.exitCode).toBe(2);
    expect(r.stdout).toMatch(/^hard-deny:/);
  }, 20_000);

  it('missing BEAVER_WORKTREE → exit 2 with clear stderr', async () => {
    // Manually spawn without injecting WORKTREE.
    const child = spawn(process.execPath, ['--import=tsx', '--no-warnings', SCRIPT], {
      env: { ...process.env, BEAVER_WORKTREE: '', BEAVER_CWD: WT },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdin.end();
    const err: Buffer[] = [];
    child.stderr.on('data', (c: Buffer) => err.push(c));
    const code = await new Promise<number>((resolve) => child.on('exit', (c) => resolve(c ?? -1)));
    expect(code).toBe(2);
    expect(Buffer.concat(err).toString('utf8')).toMatch(/BEAVER_WORKTREE/);
  }, 20_000);
});
