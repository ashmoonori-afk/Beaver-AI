// Shared shapes for checkpoint kind modules.
//
// Each kind ships as a self-contained file under `webapp/src/checkpoints/`
// that exports a `CheckpointEntry`: a Body component (kind-specific copy)
// + an Actions component (one of three reusable shapes — approve-style /
// free-form / budget). The registry assembles the lookup so callers never
// `if (kind === 'X')` cascade.

import type { CheckpointKind, CheckpointSummary } from '../types.js';

export interface CheckpointBodyProps {
  checkpoint: CheckpointSummary;
  /** W.10 — kinds that want to surface in-body actions (e.g.
   *  goal-refinement's per-section "suggest edit" buttons that post a
   *  `comment:[section] …` reply) get the same submitter the Actions
   *  component uses. Most bodies ignore it and render purely. */
  onAnswer?: (id: string, response: string) => Promise<void>;
}

export interface CheckpointActionsProps {
  checkpoint: CheckpointSummary;
  /** Caller-supplied submit. Must complete or throw — the actions component
   *  disables its buttons during the await and re-enables on rejection. */
  onAnswer: (id: string, response: string) => Promise<void>;
}

export interface CheckpointEntry {
  Body: React.ComponentType<CheckpointBodyProps>;
  Actions: React.ComponentType<CheckpointActionsProps>;
}

export type CheckpointRegistry = Record<CheckpointKind, CheckpointEntry>;
