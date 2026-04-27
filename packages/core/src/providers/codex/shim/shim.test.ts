// Spawn-based tests for the Codex POSIX shim scripts. Skipped on Windows
// (the shims are bash; v0.1 has no Windows equivalent — see README.md).

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// classify-cli lives at packages/core/src/sandbox/classify-cli.ts
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..', '..', '..');
const CLASSIFY_CLI = path.join(REPO_ROOT, 'packages', 'core', 'src', 'sandbox', 'classify-cli.ts');

interface Result {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runShim(shimName: string, args: string[], env: NodeJS.ProcessEnv): Promise<Result> {
  return new Promise((resolve, reject) => {
    const shimPath = path.join(HERE, shimName);
    const classifyCmd = `node --import=tsx --no-warnings ${JSON.stringify(CLASSIFY_CLI)}`;
    const child = spawn('bash', [shimPath, ...args], {
      env: { ...process.env, BEAVER_CLASSIFY_CLI: classifyCmd, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
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

let tmpWt: string;

beforeEach(() => {
  tmpWt = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-shim-test-'));
});

afterEach(() => {
  fs.rmSync(tmpWt, { recursive: true, force: true });
});

describe('codex shim scripts (spawned bash)', () => {
  it('rm -rf / → hard-deny, exit 2 + stderr "policy"', async () => {
    if (process.platform === 'win32') return;
    const r = await runShim('rm', ['-rf', '/'], {
      BEAVER_WORKTREE: tmpWt,
      BEAVER_CWD: tmpWt,
      BEAVER_REAL_PATH: '/bin/rm', // unused: deny short-circuits
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/policy/);
  }, 20_000);

  it('rm <file inside worktree> → exec real rm, file is gone', async () => {
    if (process.platform === 'win32') return;
    const realRm = '/bin/rm';
    if (!fs.existsSync(realRm)) return; // skip on systems without /bin/rm
    const target = path.join(tmpWt, 'tmp.txt');
    fs.writeFileSync(target, 'doomed');
    const r = await runShim('rm', [target], {
      BEAVER_WORKTREE: tmpWt,
      BEAVER_CWD: tmpWt,
      BEAVER_REAL_PATH: realRm,
    });
    expect(r.exitCode).toBe(0);
    expect(fs.existsSync(target)).toBe(false);
  }, 20_000);

  it('npm install bcrypt → require-confirmation collapses to exit 2', async () => {
    if (process.platform === 'win32') return;
    const r = await runShim('npm', ['install', 'bcrypt'], {
      BEAVER_WORKTREE: tmpWt,
      BEAVER_CWD: tmpWt,
      BEAVER_REAL_PATH: '/usr/bin/npm',
    });
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/require-confirmation/);
  }, 20_000);

  it('curl https://example.com → allowed, exec real curl (skipped if no curl)', async () => {
    if (process.platform === 'win32') return;
    // We don't actually want a network call. Use BEAVER_REAL_PATH=/bin/true
    // so the shim execs `true` with curl's args. Verifies allow-path wiring.
    if (!fs.existsSync('/bin/true')) return;
    const r = await runShim('curl', ['--help'], {
      BEAVER_WORKTREE: tmpWt,
      BEAVER_CWD: tmpWt,
      BEAVER_REAL_PATH: '/bin/true',
    });
    expect(r.exitCode).toBe(0);
  }, 20_000);

  it('missing BEAVER_WORKTREE → shim exits non-zero', async () => {
    if (process.platform === 'win32') return;
    const r = await runShim('rm', ['foo'], {
      BEAVER_WORKTREE: '',
      BEAVER_REAL_PATH: '/bin/rm',
    });
    expect(r.exitCode).not.toBe(0);
  }, 20_000);
});
