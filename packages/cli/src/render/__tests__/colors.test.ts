import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { color, colorEnabled, setColorOverride, stripAnsi } from '../colors.js';

const ORIG_NO_COLOR = process.env['NO_COLOR'];

beforeEach(() => {
  setColorOverride(null);
  delete process.env['NO_COLOR'];
});

afterEach(() => {
  setColorOverride(null);
  if (ORIG_NO_COLOR === undefined) delete process.env['NO_COLOR'];
  else process.env['NO_COLOR'] = ORIG_NO_COLOR;
});

describe('colors', () => {
  it('strips ANSI when --no-color override set', () => {
    setColorOverride(false);
    expect(color.success('done')).toBe('done');
    expect(colorEnabled()).toBe(false);
  });

  it('strips ANSI when NO_COLOR env is set', () => {
    process.env['NO_COLOR'] = '1';
    expect(color.error('boom')).toBe('boom');
  });

  it('emits ANSI when override forces on', () => {
    setColorOverride(true);
    const out = color.success('ok');
    expect(out).not.toBe('ok');
    expect(stripAnsi(out)).toBe('ok');
  });

  it('stripAnsi handles already-plain text', () => {
    expect(stripAnsi('hello')).toBe('hello');
  });
});
