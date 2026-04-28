// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ElapsedClock, __test__ } from './ElapsedClock.js';

const { formatElapsed, formatEndedAt } = __test__;

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

describe('formatEndedAt', () => {
  it('returns null for undefined or unparseable input', () => {
    expect(formatEndedAt(undefined)).toBeNull();
    expect(formatEndedAt('not-a-date')).toBeNull();
  });

  it('formats a valid ISO timestamp as HH:MM:SS in local time', () => {
    const out = formatEndedAt('2026-04-27T12:34:56.000Z');
    expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/);
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

  it('shows an "ended HH:MM:SS" caption on terminal state instead of "frozen"', () => {
    render(
      <ElapsedClock
        startedAt="2026-04-27T00:00:00.000Z"
        endedAt="2026-04-27T00:00:30.000Z"
        state="COMPLETED"
      />,
    );
    expect(screen.queryByText('frozen')).toBeNull();
    expect(screen.queryByText('live')).toBeNull();
    expect(screen.getByText(/^ended \d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
    expect(screen.getByText('00:30')).toBeInTheDocument();
  });

  it('omits the caption entirely on terminal state with no endedAt', () => {
    const { container } = render(
      <ElapsedClock startedAt="2026-04-27T00:00:00.000Z" state="ABORTED" />,
    );
    expect(screen.queryByText('frozen')).toBeNull();
    expect(screen.queryByText('live')).toBeNull();
    expect(container.querySelectorAll('div.text-caption')).toHaveLength(0);
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
