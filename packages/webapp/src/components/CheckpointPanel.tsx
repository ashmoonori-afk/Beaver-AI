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
        className="flex h-[calc(100vh-4rem)] items-center justify-center"
      >
        <p className="text-caption text-text-500">
          No checkpoints awaiting input. Beaver will ping you here when it needs you.
        </p>
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
