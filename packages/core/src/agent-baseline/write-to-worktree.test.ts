import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { writeBaselineToWorktree } from './write-to-worktree.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-baseline-write-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeBaselineToWorktree', () => {
  const SAMPLE = '## Agent baseline\n\nhello\n';

  it('claude-code provider writes only CLAUDE.md', () => {
    const r = writeBaselineToWorktree({
      worktreePath: tmpDir,
      provider: 'claude-code',
      content: SAMPLE,
    });
    expect(r.written).toHaveLength(1);
    expect(r.written[0]).toMatch(/CLAUDE\.md$/);
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8')).toBe(SAMPLE);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
  });

  it('codex provider writes only AGENTS.md', () => {
    const r = writeBaselineToWorktree({
      worktreePath: tmpDir,
      provider: 'codex',
      content: SAMPLE,
    });
    expect(r.written).toHaveLength(1);
    expect(r.written[0]).toMatch(/AGENTS\.md$/);
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8')).toBe(SAMPLE);
    expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(false);
  });

  it('unknown provider writes both files', () => {
    const r = writeBaselineToWorktree({
      worktreePath: tmpDir,
      provider: 'future-llm',
      content: SAMPLE,
    });
    expect(r.written).toHaveLength(2);
    expect(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8')).toBe(SAMPLE);
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8')).toBe(SAMPLE);
  });

  it('creates the worktree directory if it does not yet exist', () => {
    const nested = path.join(tmpDir, 'nested', 'deep');
    writeBaselineToWorktree({
      worktreePath: nested,
      provider: 'claude-code',
      content: SAMPLE,
    });
    expect(fs.readFileSync(path.join(nested, 'CLAUDE.md'), 'utf8')).toBe(SAMPLE);
  });
});
