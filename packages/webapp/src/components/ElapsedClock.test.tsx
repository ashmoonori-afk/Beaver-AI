// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ElapsedClock, __test__ } from './ElapsedClock.js';

const { formatElapsed } = __test__;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('formatElapsed', () => {
  it('formats sub-minute durations as 00:ss', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(7000)).toBe('00:07');
    expect(formatElapsed(59_999)).toBe('00:59');
  });

  it('formats multi-minute durations as mm:ss', () => {
    expect(formatElapsed(60_000)).toBe('01:00');
    expect(formatElapsed(3 * 60_000 + 12_000)).toBe('03:12');
    expect(formatElapsed(72 * 60_000 + 5_000)).toBe('72:05');
  });

  it('clamps negative deltas to 00:00', () => {
    expect(formatElapsed(-5000)).toBe('00:00');
  });
});

describe('<ElapsedClock />', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'));
  });

  it('renders live caption when state is non-terminal', () => {
    render(<ElapsedClock startedAt="2026-04-27T00:00:00.000Z" state="EXECUTING" />);
    expect(screen.getByText('live')).toBeInTheDocument();
  });

  it('freezes the clock on terminal state and shows the frozen caption', () => {
    render(
      <ElapsedClock
        startedAt="2026-04-27T00:00:00.000Z"
        endedAt="2026-04-27T00:00:30.000Z"
        state="COMPLETED"
      />,
    );
    expect(screen.getByText('frozen')).toBeInTheDocument();
    expect(screen.getByText('00:30')).toBeInTheDocument();
  });

  it('ticks once per second while running', () => {
    render(<ElapsedClock startedAt="2026-04-27T00:00:00.000Z" state="EXECUTING" />);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText('00:03')).toBeInTheDocument();
  });
});
