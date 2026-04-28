// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';

import { isTauri } from './tauriRuntime.js';

interface MutableWindow {
  __TAURI_INTERNALS__?: unknown;
}

afterEach(() => {
  delete (window as unknown as MutableWindow).__TAURI_INTERNALS__;
});

describe('isTauri', () => {
  it('returns false in plain browser jsdom (no __TAURI_INTERNALS__)', () => {
    expect(isTauri()).toBe(false);
  });

  it('returns true once window.__TAURI_INTERNALS__ is set', () => {
    (window as unknown as MutableWindow).__TAURI_INTERNALS__ = {};
    expect(isTauri()).toBe(true);
  });
});
