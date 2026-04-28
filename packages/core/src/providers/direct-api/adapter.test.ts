import { describe, expect, it } from 'vitest';

import type { RunOptions } from '../../types/provider.js';

import { DirectApiAdapter } from './adapter.js';

const baseOpts: RunOptions = {
  prompt: 'do',
  model: 'claude-3-5-sonnet',
  worktreePath: '/tmp/x',
  thresholds: {
    softWarnUsd: 0.7,
    hardKillUsd: 1.0,
    stallSeconds: 120,
    wallClockSeconds: 1800,
  },
} as unknown as RunOptions; // RunOptions has additional fields the stub doesn't read.

describe('DirectApiAdapter', () => {
  it('exposes name + capabilities for the chosen vendor', () => {
    const adapter = new DirectApiAdapter({
      vendor: 'anthropic',
      apiKey: 'sk-test',
      defaultModel: 'claude-3-5-sonnet',
    });
    expect(adapter.name).toBe('direct-api:anthropic');
    expect(adapter.capabilities).toContain('streaming');
    expect(adapter.capabilities).toContain('custom-tools');
  });

  it('run() throws an actionable stub error in Phase 9', async () => {
    const adapter = new DirectApiAdapter({
      vendor: 'openai',
      apiKey: 'sk-test',
      defaultModel: 'gpt-5',
    });
    await expect(adapter.run(baseOpts)).rejects.toThrow(/BEAVER_PROVIDER_MODE=cli/);
  });

  it('cost() returns zero USD but preserves the token signal', () => {
    const adapter = new DirectApiAdapter({
      vendor: 'anthropic',
      apiKey: 'sk-test',
      defaultModel: 'claude-3-5-sonnet',
    });
    const c = adapter.cost({
      tokensIn: 100,
      tokensOut: 50,
      cachedInputTokens: 30,
      model: 'claude-3-5-sonnet',
    });
    expect(c.usd).toBe(0);
    expect(c.tokensIn).toBe(100);
    expect(c.tokensOut).toBe(50);
    expect(c.cachedInputTokens).toBe(30);
  });
});
