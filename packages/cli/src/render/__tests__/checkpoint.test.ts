import { beforeEach, describe, expect, it } from 'vitest';

import { setColorOverride, stripAnsi } from '../colors.js';
import { renderCheckpoint } from '../checkpoint.js';

beforeEach(() => setColorOverride(false));

const HEADER = {
  runId: 'r-1',
  spentUsd: 1.42,
  elapsedMs: 4 * 60_000 + 17_000,
  context: 'planner posted plan v1',
};

describe('renderCheckpoint', () => {
  it('plan-approval renders unified frame + approve/comment/reject body', () => {
    const out = stripAnsi(
      renderCheckpoint({
        kind: 'plan-approval',
        prompt: 'approve plan v1?',
        header: HEADER,
      }),
    );
    expect(out).toContain('checkpoint: plan-approval');
    expect(out).toContain('run: r-1 · spent: $1.42 · elapsed: 4:17');
    expect(out).toContain('context: planner posted plan v1');
    expect(out).toContain('approve plan v1?');
    expect(out).toContain('[ approve | comment <text> | reject ]');
  });

  it('budget-exceeded renders the stop/increase/continue-once body', () => {
    const out = stripAnsi(
      renderCheckpoint({
        kind: 'budget-exceeded',
        prompt: 'spent $20 of $20',
        header: HEADER,
      }),
    );
    expect(out).toContain('checkpoint: budget-exceeded');
    expect(out).toContain('[ stop | increase | continue-once ]');
  });

  it('attaches a [hint] line above the body when provided', () => {
    const out = stripAnsi(
      renderCheckpoint({
        kind: 'plan-approval',
        prompt: 'approve?',
        header: HEADER,
        hint: 'past run skipped auth here',
      }),
    );
    expect(out).toContain('[hint] past run skipped auth here');
    const hintIdx = out.indexOf('[hint]');
    const bodyIdx = out.indexOf('approve?');
    expect(hintIdx).toBeLessThan(bodyIdx);
  });

  it('omits the [hint] line when not present', () => {
    const out = stripAnsi(
      renderCheckpoint({
        kind: 'goal-clarification',
        prompt: 'which framework?',
        header: HEADER,
      }),
    );
    expect(out).not.toContain('[hint]');
    expect(out).toContain('> _');
  });
});
