// `beaver init` — creates .beaver/ in the current repo + pings claude/codex.
//
// Refuses if cwd is not a git repo (presence of .git directory or file).
// Pings `claude --version` and `codex --version`; missing CLIs are warnings,
// not errors.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';

import { Beaver } from 'beaver-ai';
import { resolveSpawnTarget } from '@beaver-ai/core';

import { color } from '../render/colors.js';
import { printerr, println } from './_shared.js';

function isGitRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, '.git'));
}

function ping(cli: string): Promise<boolean> {
  return new Promise((resolve) => {
    const target = resolveSpawnTarget(cli);
    let child;
    try {
      child = spawn(target.command, [...target.argsPrefix, '--version'], { stdio: 'ignore' });
    } catch {
      resolve(false);
      return;
    }
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

export async function runInit(argv: string[]): Promise<number> {
  const cmd = new Command('init')
    .description('initialize .beaver/ in the current repository')
    .exitOverride();
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`init: ${(e as Error).message}`);
    return 2;
  }

  const cwd = process.cwd();
  if (!isGitRepo(cwd)) {
    printerr(color.error(`init: this directory is not a git repo: ${cwd}`));
    return 1;
  }

  const beaver = new Beaver({ rootPath: cwd });
  beaver.init();
  println(color.success(`init: created ${path.join(cwd, '.beaver')}/`));

  const claudeOk = await ping('claude');
  const codexOk = await ping('codex');
  if (!claudeOk) println(color.warn('init: ! claude CLI not found on PATH (skipping ping)'));
  else println(color.success('init: ✓ claude --version ok'));
  if (!codexOk) println(color.warn('init: ! codex CLI not found on PATH (skipping ping)'));
  else println(color.success('init: ✓ codex --version ok'));

  return 0;
}
