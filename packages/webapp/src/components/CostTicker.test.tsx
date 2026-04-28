// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CostTicker, __test__ } from './CostTicker.js';

const { formatTokens } = __test__;

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

  it('renders the USD view when no tokens are provided (legacy/fallback path)', () => {
    render(<CostTicker spentUsd={5} budgetUsd={20} />);
    expect(screen.getByTestId('cost-ticker-usd')).toBeInTheDocument();
    expect(screen.queryByTestId('cost-ticker-tokens')).toBeNull();
  });
});

describe('formatTokens helper', () => {
  it('renders < 1K as the bare number', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });
  it('renders 1K..999.9K with one decimal', () => {
    expect(formatTokens(1000)).toBe('1.0K');
    expect(formatTokens(12_345)).toBe('12.3K');
    expect(formatTokens(999_999)).toBe('1000.0K');
  });
  it('renders >= 1M with two decimals', () => {
    expect(formatTokens(1_000_000)).toBe('1.00M');
    expect(formatTokens(2_345_678)).toBe('2.35M');
  });
});

describe('<CostTicker /> tokens mode (Phase 8.3)', () => {
  const tokens = { input: 18_400, output: 6_200, cached: 4_800 };
  const tokenCap = { total: 1_000_000 };

  it('renders the tokens view when costMode=tokens + tokens prop is set', () => {
    render(
      <CostTicker
        spentUsd={0}
        budgetUsd={20}
        tokens={tokens}
        tokenCap={tokenCap}
        costMode="tokens"
      />,
    );
    expect(screen.getByTestId('cost-ticker-tokens')).toBeInTheDocument();
    expect(screen.queryByTestId('cost-ticker-usd')).toBeNull();
  });

  it('shows separate input/output/cached lines using K/M formatting', () => {
    render(<CostTicker spentUsd={0} budgetUsd={20} tokens={tokens} costMode="tokens" />);
    expect(screen.getByTestId('tokens-input').textContent).toBe('18.4K');
    expect(screen.getByTestId('tokens-output').textContent).toBe('6.2K');
    expect(screen.getByTestId('tokens-cached').textContent).toBe('4.8K');
  });

  it('progress bar reflects (input + output) / cap and clamps at 100%', () => {
    render(
      <CostTicker
        spentUsd={0}
        budgetUsd={20}
        tokens={{ input: 800_000, output: 400_000, cached: 0 }}
        tokenCap={tokenCap}
        costMode="tokens"
      />,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.className).toMatch(/bg-danger-500/);
  });

  it('flips to accent-700 (warn) when (input+output) >= 70 % of cap', () => {
    render(
      <CostTicker
        spentUsd={0}
        budgetUsd={20}
        tokens={{ input: 500_000, output: 250_000, cached: 0 }}
        tokenCap={tokenCap}
        costMode="tokens"
      />,
    );
    const fill = screen.getByRole('progressbar').firstElementChild as HTMLElement;
    expect(fill.className).toMatch(/bg-accent-700/);
  });

  it('falls back to USD view when costMode=tokens but tokens prop is missing', () => {
    render(<CostTicker spentUsd={5} budgetUsd={20} costMode="tokens" />);
    expect(screen.getByTestId('cost-ticker-usd')).toBeInTheDocument();
  });

  it('honors costMode="usd" override even when tokens are present', () => {
    render(<CostTicker spentUsd={5} budgetUsd={20} tokens={tokens} costMode="usd" />);
    expect(screen.getByTestId('cost-ticker-usd')).toBeInTheDocument();
    expect(screen.queryByTestId('cost-ticker-tokens')).toBeNull();
  });

  it('shows the USD-equivalent subtitle when spentUsd > 0 (Phase 8.4)', () => {
    render(<CostTicker spentUsd={0.42} budgetUsd={20} tokens={tokens} costMode="tokens" />);
    const equiv = screen.getByTestId('tokens-usd-equiv');
    expect(equiv).toBeInTheDocument();
    expect(equiv.textContent).toMatch(/\$0\.42/);
  });

  it('omits the USD-equivalent subtitle when spentUsd is 0', () => {
    render(<CostTicker spentUsd={0} budgetUsd={20} tokens={tokens} costMode="tokens" />);
    expect(screen.queryByTestId('tokens-usd-equiv')).toBeNull();
  });
});
