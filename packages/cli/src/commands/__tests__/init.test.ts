import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setColorOverride } from '../../render/colors.js';
import { runInit } from '../init.js';

let tmpDir: string;
let origCwd: string;

beforeEach(() => {
  setColorOverride(false);
  origCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-cli-init-'));
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(origCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runInit', () => {
  it('refuses when cwd is not a git repo', async () => {
    const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await runInit([]);
    expect(code).toBe(1);
    const all = errSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(all).toMatch(/not a git repo/);
    errSpy.mockRestore();
  });

  it('creates .beaver/ + sqlite when cwd is a git repo', async () => {
    fs.mkdirSync(path.join(tmpDir, '.git'));
    const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const code = await runInit([]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(tmpDir, '.beaver', 'beaver.db'))).toBe(true);
    outSpy.mockRestore();
  }, 20_000);
});
