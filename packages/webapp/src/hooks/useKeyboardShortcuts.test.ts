// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';

import { SHORTCUTS, useKeyboardShortcuts } from './useKeyboardShortcuts.js';

beforeEach(() => {
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
});

describe('useKeyboardShortcuts', () => {
  it('opens the help dialog when "?" is pressed', () => {
    const onHelp = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelp }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['r', 'status'],
    ['c', 'checkpoints'],
    ['p', 'plan'],
    ['l', 'logs'],
    ['v', 'review'],
    ['w', 'wiki'],
  ])('navigates to #%s on key "%s"', (key, expectedHash) => {
    const onHelp = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelp }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
    expect(window.location.hash).toBe(`#${expectedHash}`);
    expect(onHelp).not.toHaveBeenCalled();
  });

  it('ignores key events when typing inside an input', () => {
    const onHelp = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelp }));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    document.body.removeChild(input);
    expect(window.location.hash).toBe('');
  });

  it('ignores Cmd/Ctrl/Alt-modified keys (so r/c/w do not fight Cmd+R reload)', () => {
    const onHelp = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onHelp }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', metaKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', altKey: true }));
    expect(window.location.hash).toBe('');
  });

  it('exposes a complete data table (no `if (key === X)` cascade)', () => {
    expect(SHORTCUTS.length).toBeGreaterThanOrEqual(7);
    expect(SHORTCUTS.find((s) => s.target === 'help')).toBeDefined();
    expect(SHORTCUTS.find((s) => s.target === 'wiki')).toBeDefined();
  });
});
