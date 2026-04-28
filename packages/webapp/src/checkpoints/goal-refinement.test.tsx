// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { goalRefinement } from './goal-refinement.js';
import { CheckpointCard } from '../components/CheckpointCard.js';
import type { CheckpointSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

const baseCheckpoint: CheckpointSummary = {
  id: 'cp-r1',
  runId: 'r1',
  kind: 'goal-refinement',
  prompt: 'Approve the enriched goal?',
  postedAt: '2026-04-28T00:00:00.000Z',
  refinement: {
    rawGoal: 'build a todo app',
    enrichedGoal: 'TypeScript + React + Vite TODO app with email auth and SQLite persistence.',
    assumptions: ['no mobile', 'single-user'],
    questions: ['cloud sync needed?'],
  },
};

describe('goalRefinement entry', () => {
  it('exports Body + Actions members', () => {
    expect(typeof goalRefinement.Body).toBe('function');
    expect(typeof goalRefinement.Actions).toBe('function');
  });

  it('renders raw + enriched goals side by side via CheckpointCard', () => {
    render(<CheckpointCard checkpoint={baseCheckpoint} onAnswer={vi.fn()} />);
    expect(screen.getByText('Your goal')).toBeInTheDocument();
    expect(screen.getByText("Beaver's read")).toBeInTheDocument();
    expect(screen.getByText('build a todo app')).toBeInTheDocument();
    expect(screen.getByText(/SQLite persistence/i)).toBeInTheDocument();
  });

  it('renders the assumptions list', () => {
    render(<CheckpointCard checkpoint={baseCheckpoint} onAnswer={vi.fn()} />);
    expect(screen.getByTestId('refinement-assumptions')).toBeInTheDocument();
    expect(screen.getByText('no mobile')).toBeInTheDocument();
    expect(screen.getByText('single-user')).toBeInTheDocument();
  });

  it('renders the clarifying questions list when non-empty', () => {
    render(<CheckpointCard checkpoint={baseCheckpoint} onAnswer={vi.fn()} />);
    expect(screen.getByTestId('refinement-questions')).toBeInTheDocument();
    expect(screen.getByText('cloud sync needed?')).toBeInTheDocument();
  });

  it('omits the questions section when empty', () => {
    const cp = {
      ...baseCheckpoint,
      refinement: { ...baseCheckpoint.refinement!, questions: [] },
    };
    render(<CheckpointCard checkpoint={cp} onAnswer={vi.fn()} />);
    expect(screen.queryByTestId('refinement-questions')).toBeNull();
  });

  it('uses the approve-style action shape (Approve/Comment/Reject)', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<CheckpointCard checkpoint={baseCheckpoint} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByRole('button', { name: /Approve checkpoint/i }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('cp-r1', 'approve'));
  });

  it('falls back to plain prompt rendering when refinement payload is missing', () => {
    const cp: CheckpointSummary = { ...baseCheckpoint };
    delete (cp as { refinement?: unknown }).refinement;
    render(<CheckpointCard checkpoint={cp} onAnswer={vi.fn()} />);
    expect(screen.getByText('Approve the enriched goal?')).toBeInTheDocument();
    expect(screen.queryByText('Your goal')).toBeNull();
  });
});
