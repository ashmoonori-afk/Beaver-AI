// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CostTicker } from './CostTicker.js';

afterEach(() => {
  cleanup();
});

describe('<CostTicker />', () => {
  it('formats spent and budget with two decimals', () => {
    render(<CostTicker spentUsd={3.4} budgetUsd={20} />);
    expect(screen.getByText('$3.40')).toBeInTheDocument();
    expect(screen.getByText('of $20.00 cap')).toBeInTheDocument();
  });

  it('uses accent fill below 70% (cool zone)', () => {
    render(<CostTicker spentUsd={5} budgetUsd={20} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toMatch(/bg-accent-500/);
  });

  it('flips to accent-700 once at the 70% warn threshold', () => {
    render(<CostTicker spentUsd={14} budgetUsd={20} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toMatch(/bg-accent-700/);
  });

  it('flips to danger fill once spent reaches the cap', () => {
    render(<CostTicker spentUsd={22} budgetUsd={20} />);
    const bar = screen.getByRole('progressbar');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toMatch(/bg-danger-500/);
  });

  it('clamps the bar width at 100% on overage', () => {
    render(<CostTicker spentUsd={50} budgetUsd={20} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('handles a zero budget without dividing by zero', () => {
    render(<CostTicker spentUsd={0} budgetUsd={0} />);
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });
});
