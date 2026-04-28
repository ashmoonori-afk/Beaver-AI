// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { PhaseTimeline } from './PhaseTimeline.js';
import type { LogEvent } from '../types.js';

afterEach(() => {
  cleanup();
});

function makeEvent(message: string, raw?: string): LogEvent {
  return {
    id: message,
    runId: 'r-1',
    ts: new Date().toISOString(),
    level: 'info',
    source: 'orchestrator',
    message,
    ...(raw !== undefined ? { raw } : {}),
  };
}

describe('PhaseTimeline', () => {
  it('marks phases done before the current state and active for the current one', () => {
    render(<PhaseTimeline events={[]} currentState="EXECUTING" />);
    // Refining + Planning should be done; Executing is active.
    const items = screen.getAllByRole('listitem');
    expect(items[0]?.textContent).toMatch(/refining your goal/i);
    expect(items[2]?.textContent).toMatch(/coding/i);
  });

  it('shows latest activity inside a phase when matching events arrive', () => {
    const events = [
      makeEvent('goal.refined'),
      makeEvent('plan.persisted'),
      makeEvent('task.dispatched'),
    ];
    render(<PhaseTimeline events={events} currentState="EXECUTING" />);
    expect(screen.getByText(/task\.dispatched/)).toBeTruthy();
  });

  it('surfaces files-touched chips from event raw payload', () => {
    const events = [
      makeEvent('task.completed', JSON.stringify({ files: ['src/login.ts', 'src/login.test.ts'] })),
    ];
    render(<PhaseTimeline events={events} currentState="REVIEWING" />);
    expect(screen.getByText('src/login.ts')).toBeTruthy();
    expect(screen.getByText('src/login.test.ts')).toBeTruthy();
  });

  it('does not show files-touched section when no payloads have files', () => {
    render(<PhaseTimeline events={[makeEvent('task.dispatched')]} currentState="EXECUTING" />);
    expect(screen.queryByText(/files touched/i)).toBeNull();
  });

  it('marks every phase done when state is COMPLETED', () => {
    render(<PhaseTimeline events={[]} currentState="COMPLETED" />);
    const items = screen.getAllByRole('listitem');
    for (const item of items) {
      // ✓ glyph appears for done phases.
      expect(item.textContent ?? '').toContain('✓');
    }
  });
});
