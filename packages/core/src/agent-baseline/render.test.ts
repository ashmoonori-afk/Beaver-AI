import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { loadAndRenderFromDisk, renderSystemPrompt } from './render.js';
import { writeBaselineToWorktree } from './write-to-worktree.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-baseline-render-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('renderSystemPrompt (pure)', () => {
  it('renders all five sections in order with single trailing newline', () => {
    const out = renderSystemPrompt({
      baseline: 'BASELINE',
      roleAddendum: 'ROLE',
      taskPrompt: 'TASK',
    });
    expect(out).toBe(
      [
        '## Agent baseline',
        '',
        'BASELINE',
        '',
        '## Role addendum',
        '',
        'ROLE',
        '',
        '## Task',
        '',
        'TASK',
        '',
      ].join('\n'),
    );
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('userOverride replaces baseline and changes the section header', () => {
    const out = renderSystemPrompt({
      baseline: 'BASELINE',
      userOverride: 'CUSTOM',
      roleAddendum: 'ROLE',
      taskPrompt: 'TASK',
    });
    expect(out).toContain('## Agent baseline (user override)');
    expect(out).toContain('CUSTOM');
    expect(out).not.toContain('BASELINE');
  });

  it('repoClaudeMd and repoAgentsMd are additive with origin headers', () => {
    const out = renderSystemPrompt({
      baseline: 'B',
      repoClaudeMd: 'CMD',
      repoAgentsMd: 'AMD',
      roleAddendum: 'R',
      taskPrompt: 'T',
    });
    expect(out).toContain('## Project conventions (from CLAUDE.md)');
    expect(out).toContain('## Project conventions (from AGENTS.md)');
    expect(out.indexOf('CMD')).toBeLessThan(out.indexOf('AMD'));
    expect(out.indexOf('AMD')).toBeLessThan(out.indexOf('## Role addendum'));
  });
});

describe('loadAndRenderFromDisk', () => {
  it('empty repo: omits repo-conventions sections', () => {
    const out = loadAndRenderFromDisk({
      provider: 'claude-code',
      role: 'coder',
      repoRoot: tmpDir,
      taskPrompt: 'do the thing',
    });
    expect(out).toContain('## Agent baseline');
    expect(out).not.toContain('Project conventions (from CLAUDE.md)');
    expect(out).not.toContain('Project conventions (from AGENTS.md)');
    expect(out).toContain('## Role addendum');
    expect(out).toContain('do the thing');
    // role/coder.md content sanity
    expect(out).toContain('worktree is your boundary');
  });

  it('repo with both CLAUDE.md and AGENTS.md: both appear with headers', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'Project rule A.');
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), 'Project rule B.');
    const out = loadAndRenderFromDisk({
      provider: 'claude-code',
      role: 'reviewer',
      repoRoot: tmpDir,
      taskPrompt: 'review this',
    });
    expect(out).toContain('Project conventions (from CLAUDE.md)');
    expect(out).toContain('Project rule A.');
    expect(out).toContain('Project conventions (from AGENTS.md)');
    expect(out).toContain('Project rule B.');
  });

  it('codex provider with only repo CLAUDE.md still renders, and writer emits AGENTS.md', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), 'Project rule A.');
    const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-baseline-worktree-'));
    try {
      const rendered = loadAndRenderFromDisk({
        provider: 'codex',
        role: 'coder',
        repoRoot: tmpDir,
        taskPrompt: 'do it',
      });
      expect(rendered).toContain('Project conventions (from CLAUDE.md)');
      expect(rendered).not.toContain('Project conventions (from AGENTS.md)');

      const result = writeBaselineToWorktree({
        worktreePath: worktree,
        provider: 'codex',
        content: rendered,
      });
      expect(result.written).toHaveLength(1);
      expect(result.written[0]).toMatch(/AGENTS\.md$/);
      expect(fs.existsSync(path.join(worktree, 'CLAUDE.md'))).toBe(false);
      expect(fs.readFileSync(path.join(worktree, 'AGENTS.md'), 'utf8')).toBe(rendered);
    } finally {
      fs.rmSync(worktree, { recursive: true, force: true });
    }
  });

  it('userOverridePath, when present, replaces the bundled baseline', () => {
    const overridePath = path.join(tmpDir, 'override.md');
    fs.writeFileSync(overridePath, 'HOUSE STYLE BASELINE');
    const out = loadAndRenderFromDisk({
      provider: 'claude-code',
      role: 'coder',
      repoRoot: tmpDir,
      taskPrompt: 'go',
      userOverridePath: overridePath,
    });
    expect(out).toContain('HOUSE STYLE BASELINE');
    expect(out).toContain('## Agent baseline (user override)');
    expect(out).not.toContain('Behavioral guidelines to reduce common LLM coding mistakes');
  });
});
