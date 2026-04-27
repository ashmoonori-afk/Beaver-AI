import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { installHook } from './hook-install.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-hook-install-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('installHook', () => {
  it('creates .claude/settings.json with one PreToolUse entry on first install', () => {
    const r = installHook({
      workdir: tmpDir,
      hookScriptPath: '/abs/path/to/hook.ts',
    });
    expect(r.added).toBe(true);

    const parsed: { hooks: { PreToolUse: { command: string }[] } } = JSON.parse(
      fs.readFileSync(r.settingsPath, 'utf8'),
    );
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
    expect(parsed.hooks.PreToolUse[0]?.command).toContain('/abs/path/to/hook.ts');
  });

  it('is idempotent — second install does NOT duplicate the entry', () => {
    installHook({ workdir: tmpDir, hookScriptPath: '/abs/path/to/hook.ts' });
    const r2 = installHook({
      workdir: tmpDir,
      hookScriptPath: '/abs/path/to/hook.ts',
    });
    expect(r2.added).toBe(false);

    const parsed: { hooks: { PreToolUse: unknown[] } } = JSON.parse(
      fs.readFileSync(r2.settingsPath, 'utf8'),
    );
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
  });

  it('preserves unrelated settings keys', () => {
    const dir = path.join(tmpDir, '.claude');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'settings.json'),
      JSON.stringify({ theme: 'dark', existing: { keep: true } }, null, 2),
    );

    installHook({ workdir: tmpDir, hookScriptPath: '/abs/path/to/hook.ts' });
    const parsed: {
      theme: string;
      existing: { keep: boolean };
      hooks: { PreToolUse: unknown[] };
    } = JSON.parse(fs.readFileSync(path.join(dir, 'settings.json'), 'utf8'));

    expect(parsed.theme).toBe('dark');
    expect(parsed.existing.keep).toBe(true);
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
  });

  it('overwrites unparseable settings.json instead of crashing', () => {
    const dir = path.join(tmpDir, '.claude');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'settings.json'), 'not valid json {{{');

    const r = installHook({
      workdir: tmpDir,
      hookScriptPath: '/abs/path/to/hook.ts',
    });
    expect(r.added).toBe(true);

    const parsed: { hooks: { PreToolUse: unknown[] } } = JSON.parse(
      fs.readFileSync(r.settingsPath, 'utf8'),
    );
    expect(parsed.hooks.PreToolUse).toHaveLength(1);
  });
});
