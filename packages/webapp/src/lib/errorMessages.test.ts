import { describe, it, expect } from 'vitest';

import { classifyError } from './errorMessages.js';

describe('classifyError', () => {
  it.each([
    ['no project folder selected; pick one from the desktop app', 'workspace-missing'],
    [
      "that folder doesn't look like a Beaver project (missing .beaver/ subdir)",
      'workspace-invalid',
    ],
    ['not a beaver project', 'workspace-invalid'],
    ['goal: empty after trim', 'goal-empty'],
    ['no sidecar configured; set BEAVER_SIDECAR_NODE …', 'cli-missing'],
    ['failed to spawn sidecar /usr/local/bin/node: No such file or directory', 'cli-missing'],
    ['ENOENT: spawn claude', 'cli-missing'],
    ['ANTHROPIC_API_KEY is not set', 'api-key'],
    ['HTTP 429 rate limit exceeded', 'quota'],
    ['You have exceeded your monthly token quota', 'quota'],
    ['fetch failed: ECONNREFUSED 127.0.0.1:443', 'network'],
    ['getaddrinfo ENOTFOUND api.anthropic.com', 'network'],
  ])('classifies %j → %s', (raw, expected) => {
    const c = classifyError(raw);
    expect(c.kind).toBe(expected);
    expect(c.title.length).toBeGreaterThan(0);
    expect(c.body.length).toBeGreaterThan(0);
  });

  it('falls back to generic with the raw message body', () => {
    const c = classifyError('weird unknown error xyz');
    expect(c.kind).toBe('generic');
    expect(c.body).toMatch(/weird unknown error xyz/);
    expect(c.action?.intent).toBe('retry');
  });

  it('handles Error instances', () => {
    const c = classifyError(new Error('429 too many requests'));
    expect(c.kind).toBe('quota');
  });

  it('handles non-string non-Error inputs without crashing', () => {
    const c = classifyError({ unexpected: 'shape' });
    expect(c.kind).toBe('generic');
    expect(c.body.length).toBeGreaterThan(0);
  });

  it('attaches a docs URL when the action is open-docs', () => {
    const c = classifyError('claude command not recognized');
    expect(c.action?.intent).toBe('open-docs');
    expect(c.action?.href).toMatch(/^https:\/\//);
  });

  it('attaches a pick-workspace intent for workspace-missing', () => {
    const c = classifyError('no project folder selected');
    expect(c.action?.intent).toBe('pick-workspace');
  });
});
