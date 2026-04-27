// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { Bento } from './Bento.js';
import type { RunSnapshot } from '../types.js';

afterEach(() => {
  cleanup();
});

function snapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: 'r-1',
    state: 'EXECUTING',
    startedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
    spentUsd: 1.2,
    budgetUsd: 20,
    agents: [
      {
        id: 'a-1',
        role: 'planner',
        provider: 'claude-code',
        status: 'running',
        spentUsd: 0.4,
        lastLine: 'Planning…',
      },
    ],
    openCheckpoints: 0,
    ...overrides,
  };
}

describe('<Bento />', () => {
  it('renders the four headline cards', () => {
    render(<Bento snapshot={snapshot()} />);
    expect(screen.getByText('State')).toBeInTheDocument();
    expect(screen.getByText('Spent')).toBeInTheDocument();
    expect(screen.getByText('Elapsed')).toBeInTheDocument();
    expect(screen.getByText('Open checkpoints')).toBeInTheDocument();
  });

  it('renders the agents row with one card per agent', () => {
    render(<Bento snapshot={snapshot()} />);
    expect(screen.getByTestId('agents-row')).toBeInTheDocument();
    expect(screen.getByTestId('agent-card-a-1')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no agents', () => {
    render(<Bento snapshot={snapshot({ agents: [] })} />);
    expect(screen.getByText(/No agents have spawned yet/i)).toBeInTheDocument();
  });

  it('says "none" when openCheckpoints is 0', () => {
    render(<Bento snapshot={snapshot({ openCheckpoints: 0 })} />);
    expect(screen.getByText('none')).toBeInTheDocument();
  });

  it('says "awaiting input" when there are open checkpoints', () => {
    render(<Bento snapshot={snapshot({ openCheckpoints: 2 })} />);
    expect(screen.getByText('awaiting input')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
