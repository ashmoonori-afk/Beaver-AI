// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { GoalBox } from './GoalBox.js';

afterEach(() => {
  cleanup();
});

describe('<GoalBox />', () => {
  it('focuses the textarea on mount', () => {
    render(<GoalBox onSubmit={() => {}} />);
    const input = screen.getByLabelText('Goal description') as HTMLTextAreaElement;
    expect(input).toHaveFocus();
  });

  it('shows the empty-state copy', () => {
    render(<GoalBox onSubmit={() => {}} />);
    expect(screen.getByText(/Beaver is idle/i)).toBeInTheDocument();
  });

  it('preserves newlines on plain Enter (no submit)', () => {
    const onSubmit = vi.fn();
    render(<GoalBox onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Goal description') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'line one' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits on Cmd+Enter with the trimmed value', () => {
    const onSubmit = vi.fn();
    render(<GoalBox onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Goal description') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '  build a landing page  ' } });
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(onSubmit).toHaveBeenCalledWith('build a landing page');
  });

  it('submits on Ctrl+Enter for non-mac users', () => {
    const onSubmit = vi.fn();
    render(<GoalBox onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Goal description') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'goal' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith('goal');
  });

  it('does not submit empty / whitespace-only goals', () => {
    const onSubmit = vi.fn();
    render(<GoalBox onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Goal description') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '   \n\t  ' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('Run button disabled until the textarea has non-whitespace content', () => {
    render(<GoalBox onSubmit={() => {}} />);
    const button = screen.getByRole('button', { name: 'Run' });
    expect(button).toBeDisabled();
    const input = screen.getByLabelText('Goal description');
    fireEvent.change(input, { target: { value: 'hi' } });
    expect(button).not.toBeDisabled();
  });

  it('preserves multi-line paste content untouched', () => {
    const onSubmit = vi.fn();
    render(<GoalBox onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Goal description') as HTMLTextAreaElement;
    const multi = 'line one\nline two\nline three';
    fireEvent.change(input, { target: { value: multi } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledWith(multi);
  });

  it('respects disabled prop (no submit, run button greyed)', () => {
    const onSubmit = vi.fn();
    render(<GoalBox onSubmit={onSubmit} disabled />);
    const input = screen.getByLabelText('Goal description') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'goal' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });
});
