// PRDPane — view and edit the active workspace's PRD draft. v0.2 M1.4.
//
// Reads from <workspace>/.beaver/prd-draft.md via the usePrdDraft hook,
// renders a textarea bound to the markdown body, and persists edits
// through prd_save_draft with a 500 ms debounce. The orchestrator's
// refiner output (M1.3b) shows up here automatically because the hook
// polls every 1500 ms.
//
// Editor choice: plain textarea per the PRD ("textarea or markdown
// editor; pick the lighter option"). A rendered preview is a v0.2.x
// follow-up — the validator already enforces structure so the raw
// markdown is readable enough on its own.

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { PRIMARY, SECONDARY } from '../lib/buttonClasses.js';
import { cn } from '../lib/utils.js';
import { usePrdDraft } from '../hooks/usePrdDraft.js';
import { useCheckpoints, type CheckpointTransport } from '../hooks/useCheckpoints.js';

const SAVE_DEBOUNCE_MS = 500;

/** No-op transport used when the caller did not pass a real one (e.g.
 *  browser dev mode). Keeps the useCheckpoints hook from misbehaving;
 *  the PRDPane's Confirm button stays hidden in that mode anyway. */
const NOOP_TRANSPORT: CheckpointTransport = {
  subscribe() {
    return () => {};
  },
  async answer() {
    /* never called when checkpointTransport is undefined */
  },
};

export interface PRDPaneProps {
  /** When false the hook stays idle (no IPC, no polling). The shell
   *  passes false in browser-dev mode so the PRDPane still renders
   *  the empty-state copy. */
  enabled: boolean;
  /** Active orchestrator run id. When set + `checkpointTransport` is
   *  supplied, PRDPane wires its inline Confirm button to the
   *  pending `goal-refinement` checkpoint. */
  activeRunId?: string | null;
  /** Transport used to find + answer the pending goal-refinement
   *  checkpoint. Wired to the same instance the Checkpoints panel
   *  uses (so answering here updates that panel too). */
  checkpointTransport?: CheckpointTransport;
  /** Poll cadence (ms) for the draft hook. Defaults to the hook's
   *  built-in 1500 ms. Tests pass 0 to disable polling. */
  pollMs?: number;
}

export function PRDPane({
  enabled,
  pollMs,
  activeRunId,
  checkpointTransport,
}: PRDPaneProps) {
  const draft = usePrdDraft(enabled, pollMs !== undefined ? { pollMs } : undefined);
  const [draftBody, setDraftBody] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saved' | 'error'>('idle');
  const [confirmStatus, setConfirmStatus] = useState<'idle' | 'pending' | 'error'>('idle');
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const lastSyncedRef = useRef<string>('');
  const dirtyRef = useRef<boolean>(false);

  // Hook into the same checkpoint stream the Checkpoints tab uses so
  // we can find the pending goal-refinement card and answer it from
  // an inline button. When checkpointTransport / activeRunId is not
  // supplied, the Confirm button is just hidden.
  const checkpointsHook = useCheckpoints(activeRunId ?? null, checkpointTransport ?? NOOP_TRANSPORT);
  const pendingGoalRefinement = checkpointTransport
    ? checkpointsHook.checkpoints.find((c) => c.kind === 'goal-refinement')
    : undefined;

  // Sync the textarea with hook updates only when the user has not
  // typed anything since the last save. Without this guard a poll
  // landing mid-edit would clobber the user's in-progress text.
  useEffect(() => {
    if (!dirtyRef.current && draft.markdown !== lastSyncedRef.current) {
      setDraftBody(draft.markdown);
      lastSyncedRef.current = draft.markdown;
    }
  }, [draft.markdown]);

  // Debounced save. Only runs when the user has typed (`dirtyRef`) so
  // a sync from the hook (refiner write or poll) does not trigger a
  // round-trip that would just write back what we already received.
  useEffect(() => {
    if (!enabled) return undefined;
    if (!dirtyRef.current) return undefined;
    if (draftBody === lastSyncedRef.current) return undefined;
    setSaveStatus('pending');
    const id = setTimeout(() => {
      void (async () => {
        try {
          await draft.save(draftBody);
          lastSyncedRef.current = draftBody;
          dirtyRef.current = false;
          setSaveStatus('saved');
        } catch {
          // The hook already records error state; mirror it locally.
          setSaveStatus('error');
        }
      })();
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [draftBody, enabled, draft]);

  /** onChange handler: marks the body dirty so the debounce effect
   *  knows the next save is a real user edit (not a sync echo). */
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    dirtyRef.current = true;
    setDraftBody(e.target.value);
  };

  /** Inline Confirm-and-start-coding handler. Flushes any pending
   *  edit to disk (so prd-draft.md ↔ prd.md don't drift) and answers
   *  the pending goal-refinement checkpoint with 'approve'. The
   *  orchestrator picks it up on the next poll, freezes prd.md +
   *  PROMPT.md, and routes the EXECUTING phase through the PRD
   *  dispatcher. */
  const handleConfirm = useCallback(async (): Promise<void> => {
    if (!pendingGoalRefinement) return;
    setConfirmStatus('pending');
    setConfirmError(null);
    try {
      // Flush any in-flight edit so the freeze sees the latest body.
      if (dirtyRef.current && draftBody !== lastSyncedRef.current) {
        await draft.save(draftBody);
        lastSyncedRef.current = draftBody;
        dirtyRef.current = false;
      }
      await checkpointsHook.answer(pendingGoalRefinement.id, 'approve');
      setConfirmStatus('idle');
    } catch (err: unknown) {
      setConfirmStatus('error');
      setConfirmError(err instanceof Error ? err.message : String(err));
    }
  }, [pendingGoalRefinement, draft, draftBody, checkpointsHook]);

  if (draft.loading && draft.markdown === '') {
    return (
      <section className="flex min-h-[20rem] items-center justify-center py-6">
        <p className="text-body text-text-400" aria-live="polite">
          Loading PRD draft…
        </p>
      </section>
    );
  }

  if (!enabled) {
    return (
      <section className="flex min-h-[20rem] flex-col items-center justify-center gap-3 py-6">
        <p className="text-body text-text-300">PRD draft is only available in the desktop app.</p>
        <p className="text-caption text-text-500">
          The browser dev shell does not have access to the workspace filesystem.
        </p>
      </section>
    );
  }

  if (!draft.exists && draftBody === '') {
    return (
      <section className="flex min-h-[20rem] flex-col items-center justify-center gap-3 py-6">
        <p className="text-body text-text-300">No PRD draft yet.</p>
        <p className="text-caption text-text-500">
          Submit a goal on the Status panel and the refiner will populate this view.
        </p>
        <button
          type="button"
          onClick={() => {
            void draft.refresh();
          }}
          className={cn(SECONDARY, 'mt-2')}
          aria-label="Refresh PRD draft"
        >
          Refresh
        </button>
        {draft.error ? (
          <p
            className="mt-2 text-caption text-danger-500"
            role="alert"
            data-testid="prd-status-error"
          >
            {draft.error}
          </p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 py-6" data-testid="prd-pane">
      <div className="flex items-center justify-between">
        <h2 className="text-body font-medium text-text-50">PRD draft</h2>
        <PrdStatusLabel
          status={saveStatus}
          existsOnDisk={draft.exists}
          hookError={draft.error}
        />
      </div>
      <p className="text-caption text-text-500">
        Edits save automatically to{' '}
        <code className="rounded bg-surface-800 px-1 text-text-300">.beaver/prd-draft.md</code>
        . Approve the goal-refinement checkpoint to freeze this draft into{' '}
        <code className="rounded bg-surface-800 px-1 text-text-300">prd.md</code>.
      </p>
      <label className="sr-only" htmlFor="prd-draft-textarea">
        PRD draft markdown
      </label>
      <textarea
        id="prd-draft-textarea"
        value={draftBody}
        onChange={handleChange}
        spellCheck={false}
        rows={24}
        className="min-h-[24rem] w-full resize-y rounded-card border border-surface-700 bg-surface-900 px-3 py-2 font-mono text-body text-text-50 placeholder:text-text-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        placeholder="The refiner has not produced a draft yet."
      />
      {pendingGoalRefinement ? (
        <ConfirmGate
          status={confirmStatus}
          error={confirmError}
          onConfirm={() => {
            void handleConfirm();
          }}
          itemCount={countAcceptanceItems(draftBody)}
        />
      ) : null}
    </section>
  );
}

interface PrdStatusLabelProps {
  status: 'idle' | 'pending' | 'saved' | 'error';
  existsOnDisk: boolean;
  hookError: string | null;
}

/** Inline status pill above the textarea — shows save state to the
 *  user without taking a toast/notification dependency. */
function PrdStatusLabel({ status, existsOnDisk, hookError }: PrdStatusLabelProps) {
  if (hookError) {
    return (
      <span className="text-caption text-danger-500" role="alert" data-testid="prd-status-error">
        {hookError}
      </span>
    );
  }
  if (status === 'pending') {
    return (
      <span className="text-caption text-text-400" aria-live="polite" data-testid="prd-status">
        Saving…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="text-caption text-accent-500" aria-live="polite" data-testid="prd-status">
        Saved
      </span>
    );
  }
  return (
    <span className="text-caption text-text-500" data-testid="prd-status">
      {existsOnDisk ? 'On disk' : 'Empty'}
    </span>
  );
}

interface ConfirmGateProps {
  status: 'idle' | 'pending' | 'error';
  error: string | null;
  onConfirm: () => void;
  /** Acceptance items currently parseable from the draft. We block
   *  the click when 0 because the dispatcher would have nothing to
   *  do — every task would be skipped and the run would finish
   *  silently (the bug v0.2.1 fixes). */
  itemCount: number;
}

/** Inline Confirm-and-start-coding card. Renders only when the
 *  orchestrator has a pending `goal-refinement` checkpoint for the
 *  active run; absent otherwise (PRD pane stays a pure editor). */
function ConfirmGate({ status, error, onConfirm, itemCount }: ConfirmGateProps) {
  const noTasks = itemCount === 0;
  return (
    <div
      className="mt-2 flex flex-col gap-2 rounded-card border border-surface-700 bg-surface-800 p-4"
      data-testid="prd-confirm-gate"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-body font-medium text-text-50">Confirm and start coding</h3>
        <span className="text-caption text-text-500" data-testid="prd-item-count">
          {itemCount} acceptance item{itemCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-caption text-text-400">
        Approves the goal-refinement checkpoint, freezes the draft to{' '}
        <code className="rounded bg-surface-900 px-1 text-text-300">.beaver/prd.md</code>, and
        kicks off the PRD dispatcher (one coder/reviewer cycle per acceptance item).
      </p>
      {noTasks ? (
        <p className="text-caption text-danger-500" role="alert" data-testid="prd-no-tasks-warn">
          The Acceptance section has no <code>- [ ]</code> items. The dispatcher would skip
          coding entirely. Add at least one item, or hit Confirm to finish without coding.
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-3">
        {error ? (
          <span className="text-caption text-danger-500" role="alert">
            {error}
          </span>
        ) : null}
        <button
          type="button"
          className={PRIMARY}
          onClick={onConfirm}
          disabled={status === 'pending'}
          aria-label="Confirm PRD and start coding"
        >
          {status === 'pending' ? 'Confirming…' : 'Confirm and start coding'}
        </button>
      </div>
    </div>
  );
}

/** Count parseable `- [ ]` / `- [x]` items in the draft. Mirrors the
 *  dispatcher's parser at the textbook regex level so the inline
 *  warning matches what the dispatcher will actually see. */
function countAcceptanceItems(markdown: string): number {
  const lines = markdown.split('\n');
  let inAcceptance = false;
  let acceptanceLevel = 0;
  let inFence = false;
  let count = 0;
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const depth = heading[1]?.length ?? 0;
      const title = heading[2]?.trim().toLowerCase() ?? '';
      if (
        title === 'acceptance' ||
        title === 'acceptance criteria' ||
        title === 'acceptance checklist'
      ) {
        inAcceptance = true;
        acceptanceLevel = depth;
        continue;
      }
      if (inAcceptance && depth <= acceptanceLevel) inAcceptance = false;
      continue;
    }
    if (!inAcceptance) continue;
    if (/^\s*-\s+\[[ xX]\]\s+\S/.test(line)) count += 1;
  }
  return count;
}
