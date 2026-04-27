// One row in the #checkpoints panel. Wraps the kind-specific Body +
// Actions from the registry, with an optional HintLine above. The card
// itself owns no answer logic — that's the Actions component's job.

import { HintLine } from '../checkpoints/HintLine.js';
import { CHECKPOINT_REGISTRY } from '../checkpoints/registry.js';
import type { CheckpointSummary } from '../types.js';

export interface CheckpointCardProps {
  checkpoint: CheckpointSummary;
  onAnswer: (id: string, response: string) => Promise<void>;
}

export function CheckpointCard({ checkpoint, onAnswer }: CheckpointCardProps) {
  const entry = CHECKPOINT_REGISTRY[checkpoint.kind];
  const { Body, Actions } = entry;
  return (
    <article
      data-testid={`checkpoint-card-${checkpoint.id}`}
      className="flex flex-col gap-3 rounded-card bg-surface-800 px-5 py-4"
    >
      {checkpoint.hint ? <HintLine hint={checkpoint.hint} /> : null}
      <Body checkpoint={checkpoint} />
      <Actions checkpoint={checkpoint} onAnswer={onAnswer} />
    </article>
  );
}
