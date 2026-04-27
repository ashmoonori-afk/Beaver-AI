import { describe, it, expect } from 'vitest';

import { makeMockAskWikiTransport } from './mockAskWikiTransport.js';

describe('makeMockAskWikiTransport', () => {
  it('returns the empty-wiki fallback when the question starts with "empty"', async () => {
    const transport = makeMockAskWikiTransport();
    const ac = new AbortController();
    const a = await transport.ask('empty wiki please', ac.signal);
    expect(a.empty).toBe(true);
    expect(a.citations).toEqual([]);
    expect(a.text).toBe('');
  });

  it('returns one citation with a path + excerpt for normal questions', async () => {
    const transport = makeMockAskWikiTransport();
    const ac = new AbortController();
    const a = await transport.ask('what about auth', ac.signal);
    expect(a.empty).toBe(false);
    expect(a.citations).toHaveLength(1);
    expect(a.citations[0]?.path).toMatch(/runs\//);
  });

  it('marks excerpts longer than 200 chars as truncated', async () => {
    const transport = makeMockAskWikiTransport();
    const longQ = 'x'.repeat(400);
    const a = await transport.ask(longQ, new AbortController().signal);
    expect(a.citations[0]?.truncated).toBe(true);
    expect(a.citations[0]?.excerpt.length).toBeLessThanOrEqual(200);
  });
});
