// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CheckpointCard } from './CheckpointCard.js';
import type { CheckpointKind, CheckpointSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

function cp(kind: CheckpointKind, overrides: Partial<CheckpointSummary> = {}): CheckpointSummary {
  return {
    id: 'cp-1',
    runId: 'r-1',
    kind,
    prompt: `prompt for ${kind}`,
    postedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
    ...overrides,
  };
}

describe('<CheckpointCard />', () => {
  it('renders the kind-specific body for plan-approval', () => {
    render(<CheckpointCard checkpoint={cp('plan-approval')} onAnswer={vi.fn()} />);
    expect(screen.getByText('Plan approval')).toBeInTheDocument();
    expect(screen.getByText('prompt for plan-approval')).toBeInTheDocument();
  });

  it('renders the danger framing for risky-change-confirmation', () => {
    render(<CheckpointCard checkpoint={cp('risky-change-confirmation')} onAnswer={vi.fn()} />);
    expect(screen.getByText('Risky change — confirm')).toBeInTheDocument();
  });

  it('renders the budget-exceeded body with the three options', () => {
    render(<CheckpointCard checkpoint={cp('budget-exceeded')} onAnswer={vi.fn()} />);
    expect(screen.getByText('Budget exceeded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop run' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase cap' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue once' })).toBeInTheDocument();
  });

  it('renders a free-form textarea for goal-clarification', () => {
    render(<CheckpointCard checkpoint={cp('goal-clarification')} onAnswer={vi.fn()} />);
    expect(screen.getByLabelText('Response')).toBeInTheDocument();
  });

  it('renders the HintLine when hint is present', () => {
    const onAnswer = vi.fn();
    render(
      <CheckpointCard
        checkpoint={cp('plan-approval', {
          hint: { text: 'mind the budget', sourcePages: ['runs/x.md'] },
        })}
        onAnswer={onAnswer}
      />,
    );
    expect(screen.getByTestId('hint-line')).toBeInTheDocument();
  });

  it('does not render the HintLine when hint is absent', () => {
    render(<CheckpointCard checkpoint={cp('plan-approval')} onAnswer={vi.fn()} />);
    expect(screen.queryByTestId('hint-line')).toBeNull();
  });

  it('calls onAnswer with the right response when a button is clicked', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<CheckpointCard checkpoint={cp('plan-approval')} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve checkpoint/i }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('cp-1', 'approve'));
  });
});
