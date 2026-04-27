import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { installShim, SHIM_COMMANDS } from './shim-install.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-shim-install-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('installShim', () => {
  it('throws on Windows with a v0.2 pointer', () => {
    if (process.platform !== 'win32') return;
    expect(() =>
      installShim({ workdir: tmpDir, classifyCliPath: '/abs/classify-cli.ts' }),
    ).toThrowError(/Windows is not supported/);
  });

  it('first install copies all 7 shims with executable bit + writes meta', () => {
    if (process.platform === 'win32') return;
    const r = installShim({ workdir: tmpDir, classifyCliPath: '/abs/classify-cli.ts' });
    expect(r.installed.sort()).toEqual([...SHIM_COMMANDS].sort());

    for (const name of SHIM_COMMANDS) {
      const p = path.join(r.shimDir, name);
      expect(fs.existsSync(p)).toBe(true);
      const mode = fs.statSync(p).mode & 0o777;
      // 0o755 == rwxr-xr-x; user-exec bit (0o100) is the load-bearing one.
      expect(mode & 0o100).toBe(0o100);
    }
    const meta = JSON.parse(
      fs.readFileSync(path.join(r.shimDir, '.beaver-shim-meta.json'), 'utf8'),
    );
    expect(meta.classifyCliCommand).toContain('classify-cli.ts');
    expect(fs.readFileSync(path.join(r.shimDir, '.beaver-classify-cmd'), 'utf8')).toContain(
      'classify-cli.ts',
    );
  });

  it('second install with same classifyCliPath is a no-op', () => {
    if (process.platform === 'win32') return;
    installShim({ workdir: tmpDir, classifyCliPath: '/abs/classify-cli.ts' });
    const r2 = installShim({
      workdir: tmpDir,
      classifyCliPath: '/abs/classify-cli.ts',
    });
    expect(r2.installed).toEqual([]);
  });

  it('reinstall with different classifyCliPath rewrites all shims', () => {
    if (process.platform === 'win32') return;
    installShim({ workdir: tmpDir, classifyCliPath: '/abs/old.ts' });
    const r2 = installShim({ workdir: tmpDir, classifyCliPath: '/abs/new.ts' });
    expect(r2.installed.sort()).toEqual([...SHIM_COMMANDS].sort());
    const meta = JSON.parse(
      fs.readFileSync(path.join(r2.shimDir, '.beaver-shim-meta.json'), 'utf8'),
    );
    expect(meta.classifyCliCommand).toContain('new.ts');
  });
});
