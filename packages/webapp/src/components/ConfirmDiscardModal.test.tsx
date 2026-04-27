// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ConfirmDiscardModal } from './ConfirmDiscardModal.js';

afterEach(() => {
  cleanup();
});

describe('<ConfirmDiscardModal />', () => {
  it('focuses the Discard button on mount', () => {
    render(<ConfirmDiscardModal onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Confirm discard/i })).toHaveFocus();
  });

  it('calls onConfirm when Discard is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDiscardModal onConfirm={onConfirm} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Confirm discard/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDiscardModal onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the backdrop is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDiscardModal onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId('confirm-discard-modal'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when the dialog body is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDiscardModal onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText(/Discard run output/i));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('disables the Discard button when busy is true', () => {
    render(<ConfirmDiscardModal onConfirm={vi.fn()} onCancel={vi.fn()} busy />);
    expect(screen.getByRole('button', { name: /Confirm discard/i })).toBeDisabled();
  });

  it('cancels on Escape key', () => {
    const onCancel = vi.fn();
    render(<ConfirmDiscardModal onConfirm={vi.fn()} onCancel={onCancel} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
