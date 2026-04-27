import { describe, expect, it } from 'vitest';

import { noopWikiQuery } from './wiki-query.js';

describe('noopWikiQuery', () => {
  it('returns null for plan-approval (no hint available pre-Phase-5)', () => {
    expect(
      noopWikiQuery.hintFor({
        kind: 'plan-approval',
        runId: 'r1',
        prompt: 'whatever',
      }),
    ).toBeNull();
  });

  it('returns null for risky-change-confirmation as well', () => {
    expect(
      noopWikiQuery.hintFor({
        kind: 'risky-change-confirmation',
        runId: 'r1',
        prompt: 'rm -rf /',
      }),
    ).toBeNull();
  });
});
