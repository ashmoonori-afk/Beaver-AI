// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { PlanPanel } from './PlanPanel.js';
import type { PlanSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

function plan(version: number): PlanSummary {
  return {
    id: `p-${version}`,
    runId: 'r-1',
    version,
    createdAt: new Date('2026-04-28T00:00:00.000Z').toISOString(),
    tasks: [
      { id: 't1', agentRole: 'planner', title: `outline v${version}` },
      { id: 't2', agentRole: 'coder', title: `code v${version}`, dependsOn: ['t1'] },
    ],
  };
}

describe('<PlanPanel />', () => {
  it('shows the empty-state copy when no plans exist', () => {
    render(<PlanPanel plans={[]} />);
    expect(screen.getByText(/No plan yet/i)).toBeInTheDocument();
  });

  it('renders the latest plan card by default', () => {
    render(<PlanPanel plans={[plan(2), plan(1)]} />);
    expect(screen.getByTestId('plan-card-p-2')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-card-p-1')).toBeNull();
  });

  it('switches to an older plan via the version dropdown and dims the rest', () => {
    render(<PlanPanel plans={[plan(2), plan(1)]} />);
    fireEvent.change(screen.getByTestId('plan-version-dropdown'), { target: { value: 'p-1' } });
    expect(screen.getByTestId('plan-card-p-1')).toBeInTheDocument();
    expect(screen.getByTestId('plan-panel').className).toMatch(/opacity-60/);
  });

  it('renders task title + role + dependency annotation', () => {
    render(<PlanPanel plans={[plan(1)]} />);
    expect(screen.getByText('outline v1')).toBeInTheDocument();
    expect(screen.getByText(/coder · depends on t1/i)).toBeInTheDocument();
  });
});
