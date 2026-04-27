// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ApproveActions, BudgetActions, FreeFormActions } from './actions.js';
import type { CheckpointSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

const cp: CheckpointSummary = {
  id: 'cp-1',
  runId: 'r-1',
  kind: 'plan-approval',
  prompt: 'do it?',
  postedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
};

describe('<ApproveActions />', () => {
  it('sends "approve" on approve click', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<ApproveActions checkpoint={cp} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve checkpoint/i }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('cp-1', 'approve'));
  });

  it('sends "reject" on reject click', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<ApproveActions checkpoint={cp} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /Reject checkpoint/i }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('cp-1', 'reject'));
  });

  it('opens the textarea on Comment click and submits "comment:<text>"', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<ApproveActions checkpoint={cp} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /Comment on checkpoint/i }));
    const ta = screen.getByLabelText('Comment') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '  please rebase first  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send comment' }));
    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith('cp-1', 'comment:please rebase first'),
    );
  });

  it('disables every action while a submit is in flight (no double submit)', async () => {
    let resolve!: () => void;
    const onAnswer = vi.fn().mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolve = r;
        }),
    );
    render(<ApproveActions checkpoint={cp} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve checkpoint/i }));
    expect(screen.getByRole('button', { name: /Approve checkpoint/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Reject checkpoint/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Approve checkpoint/i }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    resolve();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Approve checkpoint/i })).not.toBeDisabled(),
    );
  });

  it('shows a toast and re-enables buttons on rejection', async () => {
    const onAnswer = vi.fn().mockRejectedValue(new Error('server said no'));
    render(<ApproveActions checkpoint={cp} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve checkpoint/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('server said no'));
    expect(screen.getByRole('button', { name: /Approve checkpoint/i })).not.toBeDisabled();
  });
});

describe('<FreeFormActions />', () => {
  it('Send button is disabled until the textarea has content', () => {
    const onAnswer = vi.fn();
    render(<FreeFormActions checkpoint={cp} onAnswer={onAnswer} />);
    expect(screen.getByRole('button', { name: 'Send response' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Response'), { target: { value: 'hi' } });
    expect(screen.getByRole('button', { name: 'Send response' })).not.toBeDisabled();
  });

  it('sends the trimmed text on Send', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<FreeFormActions checkpoint={cp} onAnswer={onAnswer} />);
    fireEvent.change(screen.getByLabelText('Response'), {
      target: { value: '  resolve by hand  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send response' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('cp-1', 'resolve by hand'));
  });
});

describe('<BudgetActions />', () => {
  it.each([
    ['Stop run', 'stop'],
    ['Increase cap', 'increase'],
    ['Continue once', 'continue-once'],
  ])('sends the canonical "%s" → "%s" response', async (label, value) => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<BudgetActions checkpoint={cp} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('cp-1', value));
  });
});
