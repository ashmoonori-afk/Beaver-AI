// Left panel: GoalBox (when no run) / chat-style transcript hook for
// the active run + Continue-run draft. v0.2 M3.1.
//
// For M3 we keep the chat surface minimal: the existing GoalBox +
// continue-run textarea. Streaming chat history is a v0.2.x follow-up
// (the orchestrator's audit events already capture every user reply
// to the goal-refinement / plan-approval / final-review checkpoints).

import type { ReactNode } from 'react';

import { GoalBox } from './GoalBox.js';

export interface ChatPaneProps {
  activeRunId: string | null;
  onSubmit: (goal: string) => void;
  /** Continue-run draft + button. Rendered when the active run is
   *  in a terminal state. */
  continueCta?: ReactNode;
  /** Workspace picker card injected by the shell when no workspace
   *  is selected. */
  workspaceCard?: ReactNode;
}

export function ChatPane({ activeRunId, onSubmit, continueCta, workspaceCard }: ChatPaneProps) {
  return (
    <div className="flex h-full flex-col gap-4 px-4 py-6" data-testid="chat-pane">
      <h2 className="text-caption uppercase tracking-wide text-text-500">Chat</h2>
      {!activeRunId ? (
        <div className="flex flex-1 flex-col items-center justify-center">
          {workspaceCard ?? <GoalBox onSubmit={onSubmit} />}
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-3">
          <p className="text-caption text-text-500">
            Active run:{' '}
            <code className="rounded bg-surface-800 px-1 text-text-300">{activeRunId}</code>
          </p>
          {continueCta}
        </div>
      )}
    </div>
  );
}
