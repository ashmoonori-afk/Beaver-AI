import { describe, it, expect } from 'vitest';

import { CHECKPOINT_REGISTRY } from './registry.js';
import { CHECKPOINT_KINDS } from '../types.js';

describe('CHECKPOINT_REGISTRY', () => {
  it('has an entry for every CheckpointKind', () => {
    for (const kind of CHECKPOINT_KINDS) {
      expect(CHECKPOINT_REGISTRY[kind]).toBeDefined();
      expect(typeof CHECKPOINT_REGISTRY[kind].Body).toBe('function');
      expect(typeof CHECKPOINT_REGISTRY[kind].Actions).toBe('function');
    }
  });

  it('exposes only the canonical 7 kinds (no extras)', () => {
    const keys = Object.keys(CHECKPOINT_REGISTRY).sort();
    const canon = [...CHECKPOINT_KINDS].sort();
    expect(keys).toEqual(canon);
  });
});
