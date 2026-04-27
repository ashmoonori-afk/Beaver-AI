// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { HelpDialog } from './HelpDialog.js';

afterEach(() => {
  cleanup();
});

describe('<HelpDialog />', () => {
  it('focuses the close button on mount', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Close help dialog/i })).toHaveFocus();
  });

  it('lists every documented shortcut', () => {
    render(<HelpDialog onClose={vi.fn()} />);
    expect(screen.getByText('Run / Status')).toBeInTheDocument();
    expect(screen.getByText('Checkpoints')).toBeInTheDocument();
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Wiki')).toBeInTheDocument();
    expect(screen.getByText('Open this help')).toBeInTheDocument();
    expect(screen.getByText(/Close any dialog/i)).toBeInTheDocument();
  });

  it('closes on the close button', () => {
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Close help dialog/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Esc', () => {
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} />);
    fireEvent.click(screen.getByTestId('help-dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the dialog body is clicked', () => {
    const onClose = vi.fn();
    render(<HelpDialog onClose={onClose} />);
    fireEvent.click(screen.getByText(/Keyboard shortcuts/i));
    expect(onClose).not.toHaveBeenCalled();
  });
});
