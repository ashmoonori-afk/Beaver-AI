// One agent's slot in the bento grid. Shows role · provider · status
// · USD spent · last transcript line. Status drives a single-color
// ring (emerald for running, neutral otherwise, danger on failure)
// per the design rule that color carries one signal at a time.

import { cn } from '../lib/utils.js';
import type { AgentSummary } from '../types.js';

const STATUS_RING: Record<AgentSummary['status'], string> = {
  pending: 'ring-1 ring-surface-700',
  running: 'ring-2 ring-accent-500 animate-pulse',
  completed: 'ring-1 ring-accent-700',
  failed: 'ring-2 ring-danger-500',
  killed: 'ring-2 ring-danger-400',
};

const STATUS_TEXT: Record<AgentSummary['status'], string> = {
  pending: 'pending',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  killed: 'killed',
};

export function AgentCard({ agent }: { agent: AgentSummary }) {
  return (
    <article
      data-testid={`agent-card-${agent.id}`}
      className={cn(
        'flex flex-col gap-2 rounded-card bg-surface-800 px-4 py-3 transition-all',
        STATUS_RING[agent.status],
      )}
    >
      <header className="flex items-baseline justify-between">
        <span className="text-body text-text-50 font-medium">{agent.role}</span>
        <span className="text-caption text-text-500 font-mono">{agent.provider}</span>
      </header>
      <div className="flex items-baseline justify-between">
        <span className="text-caption text-text-300">{STATUS_TEXT[agent.status]}</span>
        <span className="text-caption text-text-500 font-mono">${agent.spentUsd.toFixed(2)}</span>
      </div>
      {agent.lastLine ? (
        <p className="text-caption text-text-300 line-clamp-2 break-words">{agent.lastLine}</p>
      ) : null}
    </article>
  );
}
