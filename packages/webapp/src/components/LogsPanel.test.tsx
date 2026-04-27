// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { LogsPanel } from './LogsPanel.js';
import type { LogEvent, LogEventLevel } from '../types.js';

afterEach(() => {
  cleanup();
});

function ev(id: string, level: LogEventLevel, message = `msg-${id}`): LogEvent {
  return {
    id,
    runId: 'r-1',
    ts: '2026-04-28T12:34:56.000Z',
    level,
    source: 'orchestrator',
    message,
    raw: JSON.stringify({ id, level, message }),
  };
}

describe('<LogsPanel />', () => {
  it('renders the level filter chips and the JSON toggle', () => {
    render(<LogsPanel events={[]} />);
    expect(screen.getByRole('group', { name: /Log level filter/i })).toBeInTheDocument();
    for (const label of ['All', 'Info', 'Warn', 'Error', 'Debug']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Show raw JSON')).toBeInTheDocument();
  });

  it('shows the empty-state copy when no events match the filter', () => {
    render(<LogsPanel events={[]} />);
    expect(screen.getByTestId('logs-empty')).toBeInTheDocument();
  });

  it('filters events by level when a chip is selected', () => {
    const events = [ev('a', 'info'), ev('b', 'warn'), ev('c', 'error')];
    render(<LogsPanel events={events} />);
    fireEvent.click(screen.getByRole('button', { name: 'Warn' }));
    expect(screen.getByRole('button', { name: 'Warn' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles to the JSON code block on --json check', () => {
    const events = [ev('a', 'info', 'hello')];
    render(<LogsPanel events={events} />);
    fireEvent.click(screen.getByLabelText('Show raw JSON'));
    expect(screen.getByTestId('logs-json')).toBeInTheDocument();
    expect(screen.getByTestId('logs-json').textContent).toMatch(/hello/);
  });

  it('marks the scroll container with aria-live="polite"', () => {
    const events = [ev('a', 'info')];
    render(<LogsPanel events={events} />);
    expect(screen.getByTestId('logs-scroll').getAttribute('aria-live')).toBe('polite');
  });
});
