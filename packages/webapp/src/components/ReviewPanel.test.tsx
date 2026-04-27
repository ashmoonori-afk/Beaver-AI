// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ReviewPanel } from './ReviewPanel.js';
import type { FinalReportSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

function makeReport(overrides: Partial<FinalReportSummary> = {}): FinalReportSummary {
  return {
    runId: 'r-1',
    generatedAt: '2026-04-28T00:00:00.000Z',
    markdown: '# Result\n\nShipped.',
    branches: [
      {
        ref: 'beaver/r-1/coder',
        agentRole: 'coder',
        diff: { filesChanged: 3, insertions: 90, deletions: 4 },
      },
    ],
    ...overrides,
  };
}

describe('<ReviewPanel />', () => {
  it('renders an empty-state message when there is no report yet', () => {
    render(<ReviewPanel report={null} onDecide={vi.fn()} />);
    expect(screen.getByText(/orchestrator will surface a final report/i)).toBeInTheDocument();
  });

  it('renders the branches, diff stats, and the markdown body', () => {
    render(<ReviewPanel report={makeReport()} onDecide={vi.fn()} />);
    expect(screen.getByTestId('branch-list')).toBeInTheDocument();
    expect(screen.getByTestId('diff-sparkline').textContent).toMatch(/3 files/);
    expect(screen.getByTestId('diff-sparkline').textContent).toMatch(/\+90/);
    expect(screen.getByTestId('diff-sparkline').textContent).toMatch(/-4/);
    expect(screen.getByTestId('final-report-md').textContent).toMatch(/Shipped/);
  });

  it('calls onDecide("approve") immediately when Approve is clicked', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<ReviewPanel report={makeReport()} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve and ship/i }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('approve'));
  });

  it('opens the confirm modal before discarding, and discards on confirm', async () => {
    const onDecide = vi.fn().mockResolvedValue(undefined);
    render(<ReviewPanel report={makeReport()} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /Discard run output/i }));
    expect(screen.getByTestId('confirm-discard-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirm discard/i }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledWith('discard'));
  });

  it('renders <script> markdown as text (sanitized)', () => {
    render(
      <ReviewPanel
        report={makeReport({ markdown: '<script>alert(1)</script>' })}
        onDecide={vi.fn()}
      />,
    );
    const md = screen.getByTestId('final-report-md');
    expect(md.querySelector('script')).toBeNull();
  });

  it('keeps the confirm modal open when discard rejects, so the user can retry', async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error('server said no'));
    render(<ReviewPanel report={makeReport()} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /Discard run output/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm discard/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server said no'));
    // Modal still mounted so the user can fix and retry.
    expect(screen.getByTestId('confirm-discard-modal')).toBeInTheDocument();
  });

  it('shows an error toast when decide() rejects and re-enables the buttons', async () => {
    const onDecide = vi.fn().mockRejectedValue(new Error('server said no'));
    render(<ReviewPanel report={makeReport()} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve and ship/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server said no'));
    expect(screen.getByRole('button', { name: /Approve and ship/i })).not.toBeDisabled();
  });
});
