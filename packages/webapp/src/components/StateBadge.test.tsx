// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { StateBadge } from './StateBadge.js';

afterEach(() => {
  cleanup();
});

describe('<StateBadge />', () => {
  it('renders the state label and accessible name', () => {
    render(<StateBadge state="EXECUTING" />);
    expect(screen.getByLabelText(/Run state: EXECUTING/i)).toBeInTheDocument();
    expect(screen.getByText('EXECUTING')).toBeInTheDocument();
  });

  it('uses the danger palette for FAILED', () => {
    render(<StateBadge state="FAILED" />);
    const node = screen.getByLabelText(/Run state: FAILED/i);
    expect(node.className).toMatch(/bg-danger-500/);
  });

  it('uses the danger palette for ABORTED', () => {
    render(<StateBadge state="ABORTED" />);
    const node = screen.getByLabelText(/Run state: ABORTED/i);
    expect(node.className).toMatch(/bg-danger-400/);
  });

  it('uses the accent palette for COMPLETED', () => {
    render(<StateBadge state="COMPLETED" />);
    const node = screen.getByLabelText(/Run state: COMPLETED/i);
    expect(node.className).toMatch(/bg-accent-500/);
  });

  it('renders the REFINING_GOAL state (Phase 7)', () => {
    render(<StateBadge state="REFINING_GOAL" />);
    expect(screen.getByLabelText(/Run state: REFINING_GOAL/i)).toBeInTheDocument();
    expect(screen.getByText('REFINING_GOAL')).toBeInTheDocument();
  });
});
