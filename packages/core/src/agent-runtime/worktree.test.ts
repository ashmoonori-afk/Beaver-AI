// Integration tests for createWorktree / removeWorktree.
// Uses a real git binary against a freshly-initialized repo per test.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { branchName, createWorktree, removeWorktree } from './worktree.js';

let repoRoot: string;
let scratch: string;

function runGit(cwd: string, args: string[]): void {
  const res = spawnSync('git', args, { cwd, stdio: 'pipe', encoding: 'utf8' });
  if (res.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed (${res.status}): ${res.stderr}`);
  }
}

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-worktree-'));
  repoRoot = path.join(scratch, 'repo');
  fs.mkdirSync(repoRoot);
  // Bootstrap a real git repo with one commit (worktree add -b needs a base).
  runGit(repoRoot, ['init', '--quiet', '--initial-branch=main']);
  runGit(repoRoot, ['config', 'user.email', 'beaver-test@example.com']);
  runGit(repoRoot, ['config', 'user.name', 'Beaver Test']);
  runGit(repoRoot, ['config', 'commit.gpgsign', 'false']);
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# test\n');
  runGit(repoRoot, ['add', '.']);
  runGit(repoRoot, ['commit', '--quiet', '-m', 'init']);
});

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('branchName', () => {
  it('formats `beaver/<runId>/<agentId>`', () => {
    expect(branchName('r1', 'a1')).toBe('beaver/r1/a1');
  });
});

describe('createWorktree', () => {
  it('creates the worktree directory with the configured branch', async () => {
    const wtPath = path.join(scratch, 'wt');
    const handle = await createWorktree({
      repoRoot,
      runId: 'r1',
      agentId: 'a1',
      path: wtPath,
    });

    expect(handle.path).toBe(wtPath);
    expect(handle.branch).toBe('beaver/r1/a1');
    expect(fs.existsSync(wtPath)).toBe(true);
    // Worktree gets a copy of the seeded README.md.
    expect(fs.existsSync(path.join(wtPath, 'README.md'))).toBe(true);

    // Branch is registered with git.
    const res = spawnSync('git', ['branch', '--list', 'beaver/r1/a1'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(res.stdout).toContain('beaver/r1/a1');
  });

  it('rejects if the repo is not a git directory', async () => {
    const notARepo = path.join(scratch, 'plain');
    fs.mkdirSync(notARepo);
    await expect(
      createWorktree({
        repoRoot: notARepo,
        runId: 'r1',
        agentId: 'a1',
        path: path.join(scratch, 'wt2'),
      }),
    ).rejects.toThrow();
  });
});

describe('removeWorktree', () => {
  it('removes the worktree directory and deletes the branch', async () => {
    const wtPath = path.join(scratch, 'wt');
    const handle = await createWorktree({
      repoRoot,
      runId: 'r1',
      agentId: 'a1',
      path: wtPath,
    });

    await removeWorktree({ repoRoot, path: handle.path, branch: handle.branch });

    expect(fs.existsSync(wtPath)).toBe(false);

    const res = spawnSync('git', ['branch', '--list', 'beaver/r1/a1'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    expect(res.stdout).toBe('');
  });

  it('survives a dirty worktree (uncommitted edits) thanks to --force', async () => {
    const wtPath = path.join(scratch, 'wt');
    const handle = await createWorktree({
      repoRoot,
      runId: 'r1',
      agentId: 'a1',
      path: wtPath,
    });
    fs.writeFileSync(path.join(wtPath, 'dirty.txt'), 'uncommitted\n');

    await expect(
      removeWorktree({ repoRoot, path: handle.path, branch: handle.branch }),
    ).resolves.toBeUndefined();
    expect(fs.existsSync(wtPath)).toBe(false);
  });
});
