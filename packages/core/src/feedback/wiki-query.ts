// WikiQuery interface — the indirection the feedback layer uses to attach
// `[hint]` lines on plan-approval / risky-change-confirmation checkpoints
// without taking a hard dependency on the wiki module (which arrives in
// Phase 5). v0.1 ships only the no-op stub.

import type { CheckpointKind } from './checkpoint.js';

export interface WikiQueryRequest {
  kind: CheckpointKind;
  runId: string;
  prompt: string;
}

/** A single short hint line, surfaced above the checkpoint body. */
export interface WikiHint {
  text: string;
}

export interface WikiQuery {
  /** Returns null when no relevant entry exists. */
  hintFor(req: WikiQueryRequest): WikiHint | null;
}

/** No-op stub: never returns a hint. Phase 5 swaps in the real impl. */
export const noopWikiQuery: WikiQuery = {
  hintFor(): WikiHint | null {
    return null;
  },
};
