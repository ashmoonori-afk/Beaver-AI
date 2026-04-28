// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { RunsList } from './RunsList.js';
import type { RunHistoryItem } from '../hooks/useRunsList.js';

afterEach(() => {
  cleanup();
});

const sample: RunHistoryItem[] = [
  {
    id: 'r-completed',
    goal: 'Add login flow',
    status: 'COMPLETED',
    startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    endedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    spentUsd: 0.12,
    budgetUsd: 20,
  },
  {
    id: 'r-pending',
    goal: 'Write tests for cart',
    status: 'FINAL_REVIEW_PENDING',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    endedAt: null,
    spentUsd: 0.04,
    budgetUsd: 20,
  },
];

describe('RunsList', () => {
  it('renders nothing-yet copy when the list is empty', () => {
    render(<RunsList runs={[]} activeRunId={null} onSelect={() => {}} />);
    expect(screen.getByText(/no previous runs yet/i)).toBeTruthy();
  });

  it('marks pending-review runs with a "needs review" hint', () => {
    render(<RunsList runs={sample} activeRunId={null} onSelect={() => {}} />);
    expect(screen.getByText(/needs review/i)).toBeTruthy();
  });

  it('fires onSelect with the clicked run id', () => {
    const onSelect = vi.fn();
    render(<RunsList runs={sample} activeRunId={null} onSelect={onSelect} />);
    const completed = screen.getByText('Add login flow');
    fireEvent.click(completed);
    expect(onSelect).toHaveBeenCalledWith('r-completed');
  });

  it('marks the active run with aria-current', () => {
    render(<RunsList runs={sample} activeRunId="r-pending" onSelect={() => {}} />);
    const active = screen.getByText('Write tests for cart').closest('button');
    expect(active?.getAttribute('aria-current')).toBe('true');
  });
});
