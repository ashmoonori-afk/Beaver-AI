import { beforeEach, describe, expect, it } from 'vitest';

import { setColorOverride, stripAnsi } from '../colors.js';
import { formatStatusLine, StatusLine } from '../status-line.js';

beforeEach(() => setColorOverride(false));

describe('formatStatusLine', () => {
  it('renders the canonical layout with open checkpoints', () => {
    const out = stripAnsi(
      formatStatusLine({
        state: 'executing',
        runningTasks: 3,
        totalTasks: 8,
        spentUsd: 1.42,
        elapsedMs: 4 * 60_000 + 17_000,
        openCheckpoints: 2,
      }),
    );
    expect(out).toBe('[EXECUTING] running 3/8 · spent $1.42 · elapsed 04:17 · ⌛ 2 open');
  });

  it('omits the open-checkpoints chunk when zero', () => {
    const out = stripAnsi(
      formatStatusLine({
        state: 'executing',
        runningTasks: 1,
        totalTasks: 1,
        spentUsd: 0,
        elapsedMs: 0,
        openCheckpoints: 0,
      }),
    );
    expect(out).toBe('[EXECUTING] running 1/1 · spent $0.00 · elapsed 00:00');
  });
});

describe('StatusLine driver', () => {
  it('is a no-op when stdout is not a TTY (no writes, no timer)', () => {
    let written = '';
    const fakeStream = {
      isTTY: false,
      write: (s: string): boolean => {
        written += s;
        return true;
      },
    } as unknown as NodeJS.WriteStream;
    const sl = new StatusLine({ stream: fakeStream });
    sl.update({
      state: 'executing',
      runningTasks: 1,
      totalTasks: 1,
      spentUsd: 0,
      elapsedMs: 0,
      openCheckpoints: 0,
    });
    sl.start();
    sl.stop();
    expect(written).toBe('');
  });
});
