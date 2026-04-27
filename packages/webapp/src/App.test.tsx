// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import App from './App.js';
import type { RunSnapshotTransport } from './hooks/useRunSnapshot.js';
import type { RunSnapshot } from './types.js';

beforeEach(() => {
  // Reset hash between tests so each starts on the default panel.
  window.location.hash = '';
});

afterEach(() => {
  cleanup();
});

function makeStubTransport(snapshot: RunSnapshot): RunSnapshotTransport {
  return {
    subscribe(runId, onSnapshot) {
      onSnapshot({ ...snapshot, runId });
      return () => {};
    },
  };
}

describe('<App />', () => {
  it('renders the header with brand + version', () => {
    render(<App />);
    expect(screen.getByText('Beaver')).toBeInTheDocument();
    expect(screen.getByText('v0.1')).toBeInTheDocument();
  });

  it('shows all 6 panel nav buttons', () => {
    render(<App />);
    for (const label of ['Status', 'Checkpoints', 'Plan', 'Logs', 'Review', 'Wiki']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('default Status panel shows the GoalBox empty state', () => {
    render(<App />);
    expect(screen.getByText(/Beaver is idle/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Goal description')).toBeInTheDocument();
  });

  it('the Wiki tab still shows its stub (lands in 4U.5)', () => {
    window.location.hash = '#wiki';
    render(<App />);
    expect(screen.getByText(/Wiki panel/i)).toBeInTheDocument();
  });

  it('renders the Plan panel empty state on #plan', () => {
    window.location.hash = '#plan';
    render(<App />);
    expect(screen.getByTestId('plan-panel')).toBeInTheDocument();
  });

  it('renders the Logs panel on #logs', () => {
    window.location.hash = '#logs';
    render(<App />);
    expect(screen.getByTestId('logs-panel')).toBeInTheDocument();
  });

  it('renders the Review panel empty state on #review', () => {
    window.location.hash = '#review';
    render(<App />);
    expect(screen.getByTestId('review-panel')).toBeInTheDocument();
  });

  it('renders the CheckpointPanel empty state on #checkpoints', () => {
    window.location.hash = '#checkpoints';
    render(<App />);
    expect(screen.getByTestId('checkpoint-panel')).toBeInTheDocument();
    expect(screen.getByText(/No checkpoints awaiting input/i)).toBeInTheDocument();
  });

  it('swaps GoalBox for the Bento grid once a goal is submitted', () => {
    const transport = makeStubTransport({
      runId: '',
      state: 'EXECUTING',
      startedAt: new Date('2026-04-27T00:00:00.000Z').toISOString(),
      spentUsd: 0.42,
      budgetUsd: 20,
      agents: [
        {
          id: 'a-1',
          role: 'planner',
          provider: 'claude-code',
          status: 'running',
          spentUsd: 0.12,
        },
      ],
      openCheckpoints: 0,
    });
    render(<App transport={transport} />);
    const input = screen.getByLabelText('Goal description');
    fireEvent.change(input, { target: { value: 'build a landing page' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(screen.getByTestId('bento')).toBeInTheDocument();
    expect(screen.queryByText(/Beaver is idle/i)).not.toBeInTheDocument();
  });
});
