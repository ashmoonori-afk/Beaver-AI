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

// W.10 — Ralph-inspired structured PRD/MVP/clarifying-questions surface.

const richCheckpoint: CheckpointSummary = {
  id: 'cp-r2',
  runId: 'r1',
  kind: 'goal-refinement',
  prompt: 'Approve the enriched goal + PRD + MVP, or comment to amend.',
  postedAt: '2026-04-28T00:00:00.000Z',
  refinement: {
    rawGoal: 'build a todo app',
    enrichedGoal: 'TS + React + Vite TODO app',
    assumptions: ['single-user'],
    questions: [],
    clarifyingQuestions: [
      {
        id: 'Q1',
        text: 'Auth model?',
        options: [
          { label: 'A', value: 'email + password' },
          { label: 'B', value: 'no auth' },
        ],
      },
    ],
    prd: {
      overview: 'A minimal local TODO app.',
      goals: ['create task <100ms', 'persist via SQLite'],
      userStories: [
        {
          id: 'US-001',
          title: 'Create a task',
          description: 'As a user, I want to type and press Enter so it appears.',
          acceptanceCriteria: ['empty rejected', 'persists before clear'],
        },
      ],
      nonGoals: ['no multi-device sync'],
      successMetrics: ['tests pass', 'survives kill+restart'],
    },
    mvp: {
      pitch: 'A keyboard-first TODO that just works offline.',
      features: ['create / delete', 'toggle done'],
      deferred: ['auth', 'tagging'],
      scope: '~3 days · no auth',
    },
  },
};

describe('goal-refinement W.10 — PRD / MVP / clarifying questions', () => {
  it('renders Ralph-style clarifying questions with lettered options', () => {
    render(<CheckpointCard checkpoint={richCheckpoint} onAnswer={vi.fn()} />);
    expect(screen.getByTestId('refinement-clarifying')).toBeInTheDocument();
    expect(screen.getByTestId('clarifying-Q1')).toBeInTheDocument();
    expect(screen.getByTestId('clarifying-Q1-A')).toHaveTextContent(/email \+ password/);
    expect(screen.getByTestId('clarifying-Q1-B')).toHaveTextContent(/no auth/);
  });

  it('clicking an option submits a comment:Q<id>=<label> reply', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<CheckpointCard checkpoint={richCheckpoint} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByTestId('clarifying-Q1-B'));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledWith('cp-r2', 'comment:Q1=B'));
  });

  it('renders all PRD sections: overview, goals, user stories, non-goals, success metrics', () => {
    render(<CheckpointCard checkpoint={richCheckpoint} onAnswer={vi.fn()} />);
    expect(screen.getByTestId('refinement-prd')).toBeInTheDocument();
    expect(screen.getByTestId('prd-overview')).toBeInTheDocument();
    expect(screen.getByTestId('prd-goals')).toBeInTheDocument();
    expect(screen.getByTestId('prd-user-stories')).toBeInTheDocument();
    expect(screen.getByTestId('prd-user-story-US-001')).toBeInTheDocument();
    expect(screen.getByTestId('prd-non-goals')).toBeInTheDocument();
    expect(screen.getByTestId('prd-success-metrics')).toBeInTheDocument();
  });

  it('renders all MVP sections: pitch, features, deferred, scope', () => {
    render(<CheckpointCard checkpoint={richCheckpoint} onAnswer={vi.fn()} />);
    expect(screen.getByTestId('refinement-mvp')).toBeInTheDocument();
    expect(screen.getByTestId('mvp-pitch')).toBeInTheDocument();
    expect(screen.getByTestId('mvp-features')).toBeInTheDocument();
    expect(screen.getByTestId('mvp-deferred')).toBeInTheDocument();
    expect(screen.getByTestId('mvp-scope')).toBeInTheDocument();
  });

  it('Suggest edit button on a PRD section pre-fills a comment with [prd:<section>]', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<CheckpointCard checkpoint={richCheckpoint} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByTestId('suggest-edit-prd-goals'));
    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith(
        'cp-r2',
        expect.stringMatching(/^comment:\[prd:goals\]/),
      ),
    );
  });

  it('Suggest edit on an MVP section pre-fills [mvp:<section>]', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined);
    render(<CheckpointCard checkpoint={richCheckpoint} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByTestId('suggest-edit-mvp-features'));
    await waitFor(() =>
      expect(onAnswer).toHaveBeenCalledWith(
        'cp-r2',
        expect.stringMatching(/^comment:\[mvp:features\]/),
      ),
    );
  });

  it('omits empty PRD and MVP sections gracefully', () => {
    // exactOptionalPropertyTypes — omit fields rather than passing undefined.
    const r = richCheckpoint.refinement!;
    const minimal: CheckpointSummary = {
      ...richCheckpoint,
      id: 'cp-min',
      refinement: {
        rawGoal: r.rawGoal,
        enrichedGoal: r.enrichedGoal,
        assumptions: r.assumptions,
        questions: r.questions,
      },
    };
    render(<CheckpointCard checkpoint={minimal} onAnswer={vi.fn()} />);
    expect(screen.queryByTestId('refinement-prd')).toBeNull();
    expect(screen.queryByTestId('refinement-mvp')).toBeNull();
    expect(screen.queryByTestId('refinement-clarifying')).toBeNull();
    // The basic enriched-goal diff still renders.
    expect(screen.getByText('Your goal')).toBeInTheDocument();
  });
});
