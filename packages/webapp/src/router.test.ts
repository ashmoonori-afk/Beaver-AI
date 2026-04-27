// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';

import { panelFromHash, DEFAULT_PANEL } from './router.js';

describe('panelFromHash', () => {
  it('returns DEFAULT_PANEL for empty hash', () => {
    expect(panelFromHash('')).toBe(DEFAULT_PANEL);
  });

  it('returns DEFAULT_PANEL for unknown panel', () => {
    expect(panelFromHash('#nonexistent')).toBe(DEFAULT_PANEL);
  });

  it('parses each known panel', () => {
    expect(panelFromHash('#status')).toBe('status');
    expect(panelFromHash('#checkpoints')).toBe('checkpoints');
    expect(panelFromHash('#plan')).toBe('plan');
    expect(panelFromHash('#logs')).toBe('logs');
    expect(panelFromHash('#review')).toBe('review');
    expect(panelFromHash('#wiki')).toBe('wiki');
  });

  it('strips a missing # prefix gracefully', () => {
    expect(panelFromHash('plan')).toBe('plan');
  });
});
