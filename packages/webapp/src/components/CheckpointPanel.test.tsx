// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { CheckpointPanel } from './CheckpointPanel.js';
import type { CheckpointSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

const sample: CheckpointSummary[] = [
  {
    id: 'cp-1',
    runId: 'r-1',
    kind: 'plan-approval',
    prompt: 'plan prompt',
    postedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
  },
  {
    id: 'cp-2',
    runId: 'r-1',
    kind: 'budget-exceeded',
    prompt: 'budget prompt',
    postedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
  },
];

describe('<CheckpointPanel />', () => {
  it('shows the empty-state copy when there are no checkpoints', () => {
    render(<CheckpointPanel checkpoints={[]} onAnswer={vi.fn()} />);
    expect(screen.getByText(/No checkpoints awaiting input/i)).toBeInTheDocument();
  });

  it('renders one card per checkpoint, in order', () => {
    render(<CheckpointPanel checkpoints={sample} onAnswer={vi.fn()} />);
    expect(screen.getByTestId('checkpoint-card-cp-1')).toBeInTheDocument();
    expect(screen.getByTestId('checkpoint-card-cp-2')).toBeInTheDocument();
    const cards = screen.getAllByTestId(/^checkpoint-card-/);
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
      'checkpoint-card-cp-1',
      'checkpoint-card-cp-2',
    ]);
  });
});
