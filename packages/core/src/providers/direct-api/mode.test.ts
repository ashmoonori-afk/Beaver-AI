import { describe, expect, it } from 'vitest';

import { assertApiKeysPresent, costModeFor, providerMode } from './mode.js';

describe('providerMode', () => {
  it('defaults to cli when BEAVER_PROVIDER_MODE is unset', () => {
    expect(providerMode({})).toBe('cli');
  });

  it('returns api when BEAVER_PROVIDER_MODE=api', () => {
    expect(providerMode({ BEAVER_PROVIDER_MODE: 'api' })).toBe('api');
  });

  it('is case-insensitive and trim-tolerant', () => {
    expect(providerMode({ BEAVER_PROVIDER_MODE: '  API  ' })).toBe('api');
  });

  it('falls back to cli for unrecognized values', () => {
    expect(providerMode({ BEAVER_PROVIDER_MODE: 'sdk' })).toBe('cli');
  });
});

describe('costModeFor', () => {
  it('cli -> tokens (subscription billing)', () => {
    expect(costModeFor('cli')).toBe('tokens');
  });

  it('api -> usd (real spend)', () => {
    expect(costModeFor('api')).toBe('usd');
  });
});

describe('assertApiKeysPresent', () => {
  it('returns silently when both keys are present', () => {
    expect(() =>
      assertApiKeysPresent({ ANTHROPIC_API_KEY: 'a', OPENAI_API_KEY: 'b' }),
    ).not.toThrow();
  });

  it('throws listing every missing key when keys are absent', () => {
    expect(() => assertApiKeysPresent({})).toThrow(/ANTHROPIC_API_KEY.*OPENAI_API_KEY/);
  });

  it('throws naming only the actually-missing key', () => {
    expect(() => assertApiKeysPresent({ ANTHROPIC_API_KEY: 'set' })).toThrow(/OPENAI_API_KEY/);
  });
});
