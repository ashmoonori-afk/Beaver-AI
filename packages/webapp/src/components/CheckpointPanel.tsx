// Stacks pending CheckpointCards. Empty state when no checkpoints
// are pending. The panel owns no fetching — `useCheckpoints` does.

import { CheckpointCard } from './CheckpointCard.js';
import type { CheckpointSummary } from '../types.js';

export interface CheckpointPanelProps {
  checkpoints: readonly CheckpointSummary[];
  onAnswer: (id: string, response: string) => Promise<void>;
}

export function CheckpointPanel({ checkpoints, onAnswer }: CheckpointPanelProps) {
  if (checkpoints.length === 0) {
    return (
      <section
        data-testid="checkpoint-panel"
        className="flex h-[calc(100vh-4rem)] items-center justify-center px-6"
      >
        <div
          data-testid="checkpoint-panel-empty"
          className="max-w-sm rounded-card border border-surface-700 bg-surface-800/60 p-6 text-center"
        >
          <span aria-hidden className="text-hero text-accent-500">
            ✓
          </span>
          <h2 className="mt-2 text-body text-text-50 font-medium">All clear</h2>
          <p className="mt-1 text-caption text-text-400">
            No checkpoints awaiting input. When Beaver needs your call — risky shell command, plan
            approval, merge conflict, or final review — the question lands here.
          </p>
        </div>
      </section>
    );
  }
  return (
    <section data-testid="checkpoint-panel" className="mx-auto w-full max-w-3xl space-y-4 py-6">
      {checkpoints.map((cp) => (
        <CheckpointCard key={cp.id} checkpoint={cp} onAnswer={onAnswer} />
      ))}
    </section>
  );
}
