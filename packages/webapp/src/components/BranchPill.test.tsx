// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { BranchPill } from './BranchPill.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('<BranchPill />', () => {
  it('renders the branch name and a copy hint', () => {
    render(<BranchPill branch="beaver/r-1/coder" />);
    const btn = screen.getByRole('button', { name: /Copy branch name beaver\/r-1\/coder/i });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/copy/);
  });

  it('writes the branch name to navigator.clipboard on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<BranchPill branch="beaver/r-1/reviewer" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('beaver/r-1/reviewer'));
  });

  it('does not throw when navigator.clipboard is missing', () => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(<BranchPill branch="beaver/r-1/coder" />);
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow();
  });
});
