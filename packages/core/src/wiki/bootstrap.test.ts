import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensureWiki } from './bootstrap.js';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-wiki-bs-'));
});

afterEach(() => {
  // Best-effort cleanup; restore perms first in case a test chmod'd a dir.
  try {
    fs.chmodSync(tmpRoot, 0o700);
  } catch {
    // ignore
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('ensureWiki', () => {
  it('creates wiki root, subdirs, and seed files when configDir is empty', () => {
    const result = ensureWiki(tmpRoot);
    expect(result.created).toBe(true);
    expect(result.path).toBe(path.join(tmpRoot, 'wiki'));

    for (const seed of ['SCHEMA.md', 'index.md', 'log.md', 'user-profile.md']) {
      expect(fs.existsSync(path.join(result.path, seed))).toBe(true);
    }
    for (const sub of ['projects', 'decisions', 'patterns']) {
      expect(fs.statSync(path.join(result.path, sub)).isDirectory()).toBe(true);
    }
    expect(fs.readFileSync(path.join(result.path, 'SCHEMA.md'), 'utf8')).toContain('Wiki Schema');
  });

  it('is idempotent and preserves user edits to seed files (sentinel)', () => {
    const first = ensureWiki(tmpRoot);
    const schemaPath = path.join(first.path, 'SCHEMA.md');
    const sentinel = '\n<!-- USER-EDIT-SENTINEL-DO-NOT-REMOVE -->\n';
    fs.appendFileSync(schemaPath, sentinel, 'utf8');

    const second = ensureWiki(tmpRoot);
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);
    expect(fs.readFileSync(schemaPath, 'utf8')).toContain('USER-EDIT-SENTINEL-DO-NOT-REMOVE');
  });

  it('reports created=true when only some subdirs are missing', () => {
    fs.mkdirSync(path.join(tmpRoot, 'wiki'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'wiki', 'SCHEMA.md'), 'preexisting\n', 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'wiki', 'index.md'), 'preexisting\n', 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'wiki', 'log.md'), '', 'utf8');
    fs.writeFileSync(path.join(tmpRoot, 'wiki', 'user-profile.md'), '', 'utf8');

    const result = ensureWiki(tmpRoot);
    expect(result.created).toBe(true);
    expect(fs.statSync(path.join(result.path, 'projects')).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(result.path, 'SCHEMA.md'), 'utf8')).toBe('preexisting\n');
  });

  it('returns {created:false} and does not throw when configDir is unwritable (EACCES)', () => {
    if (process.platform === 'win32') {
      // POSIX permission semantics; chmod 000 on Windows does not block writes
      // for the owning process. Skip rather than assert false-positive behavior.
      return;
    }
    fs.chmodSync(tmpRoot, 0o000);
    const warnings: string[] = [];
    const result = ensureWiki(tmpRoot, { onWarn: (m) => warnings.push(m) });
    expect(result.created).toBe(false);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/wiki bootstrap skipped/);
  });
});
