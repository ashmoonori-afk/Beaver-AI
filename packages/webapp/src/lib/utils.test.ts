import { describe, it, expect } from 'vitest';

import { cn } from './utils.js';

describe('cn', () => {
  it('joins simple class strings', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('honors conditional objects', () => {
    expect(cn('a', { b: true, c: false })).toBe('a b');
  });

  it('dedupes conflicting tailwind utilities — last wins', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
