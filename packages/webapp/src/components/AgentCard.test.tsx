// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { AgentCard } from './AgentCard.js';
import type { AgentSummary } from '../types.js';

afterEach(() => {
  cleanup();
});

const baseAgent: AgentSummary = {
  id: 'agent-1',
  role: 'planner',
  provider: 'claude-code',
  status: 'running',
  spentUsd: 0.42,
};

describe('<AgentCard />', () => {
  it('renders role, provider and spent in the headline', () => {
    render(<AgentCard agent={baseAgent} />);
    expect(screen.getByText('planner')).toBeInTheDocument();
    expect(screen.getByText('claude-code')).toBeInTheDocument();
    expect(screen.getByText('$0.42')).toBeInTheDocument();
  });

  it('shows the lastLine transcript when present', () => {
    render(<AgentCard agent={{ ...baseAgent, lastLine: 'Writing files…' }} />);
    expect(screen.getByText('Writing files…')).toBeInTheDocument();
  });

  it('omits the lastLine paragraph when not present', () => {
    const { container } = render(<AgentCard agent={baseAgent} />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('uses the running ring on running agents', () => {
    render(<AgentCard agent={baseAgent} />);
    const card = screen.getByTestId(`agent-card-${baseAgent.id}`);
    expect(card.className).toMatch(/ring-accent-500/);
  });

  it('uses the danger ring on failed agents', () => {
    render(<AgentCard agent={{ ...baseAgent, status: 'failed' }} />);
    const card = screen.getByTestId(`agent-card-${baseAgent.id}`);
    expect(card.className).toMatch(/ring-danger-500/);
  });

  it('uses the killed ring on killed agents', () => {
    render(<AgentCard agent={{ ...baseAgent, status: 'killed' }} />);
    const card = screen.getByTestId(`agent-card-${baseAgent.id}`);
    expect(card.className).toMatch(/ring-danger-400/);
  });
});
