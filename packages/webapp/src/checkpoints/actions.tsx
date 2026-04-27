// Three reusable Actions shapes for CheckpointCard. Every kind module
// picks one of these. Buttons are 44px-min hit area + visible focus ring
// per the 4U.3 review gate. Disabled state during in-flight submit
// prevents double-submit (4U.3 Bug gate).

import { useState } from 'react';

import { cn } from '../lib/utils.js';
import type { CheckpointActionsProps } from './types.js';

const BTN_BASE =
  'inline-flex min-h-[44px] items-center justify-center rounded-card px-4 py-2 ' +
  'text-body font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-800 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const PRIMARY = `${BTN_BASE} bg-accent-500 text-surface-900 hover:bg-accent-400`;
const SECONDARY = `${BTN_BASE} bg-surface-700 text-text-50 hover:bg-surface-600`;
const DESTRUCTIVE = `${BTN_BASE} bg-danger-500 text-text-50 hover:bg-danger-400`;

interface SubmitState {
  busy: boolean;
  error: string | null;
}

const IDLE: SubmitState = { busy: false, error: null };

async function submit(
  id: string,
  response: string,
  onAnswer: CheckpointActionsProps['onAnswer'],
  setState: (s: SubmitState) => void,
): Promise<void> {
  setState({ busy: true, error: null });
  try {
    await onAnswer(id, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'submit failed';
    setState({ busy: false, error: message });
    return;
  }
  setState(IDLE);
}

/** Approve / Comment (textarea) / Reject — used by approve-style kinds. */
export function ApproveActions({ checkpoint, onAnswer }: CheckpointActionsProps) {
  const [state, setState] = useState<SubmitState>(IDLE);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');

  const disabled = state.busy;
  const onApprove = (): void => void submit(checkpoint.id, 'approve', onAnswer, setState);
  const onReject = (): void => void submit(checkpoint.id, 'reject', onAnswer, setState);
  const onSendComment = (): void => {
    const trimmed = comment.trim();
    if (!trimmed) return;
    void submit(checkpoint.id, `comment:${trimmed}`, onAnswer, setState);
  };

  return (
    <div data-testid={`actions-${checkpoint.id}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={PRIMARY}
          onClick={onApprove}
          disabled={disabled}
          aria-label="Approve checkpoint"
        >
          Approve
        </button>
        <button
          type="button"
          className={SECONDARY}
          onClick={() => setCommenting((c) => !c)}
          disabled={disabled}
          aria-expanded={commenting}
          aria-label="Comment on checkpoint"
        >
          Comment
        </button>
        <button
          type="button"
          className={DESTRUCTIVE}
          onClick={onReject}
          disabled={disabled}
          aria-label="Reject checkpoint"
        >
          Reject
        </button>
      </div>
      {commenting ? (
        <div className="flex flex-col gap-2">
          <label className="sr-only" htmlFor={`comment-${checkpoint.id}`}>
            Comment
          </label>
          <textarea
            id={`comment-${checkpoint.id}`}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Leave a comment for the agent…"
            rows={3}
            className="w-full rounded-card bg-surface-900 px-3 py-2 text-body text-text-50 placeholder:text-text-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            disabled={disabled}
          />
          <div className="flex justify-end">
            <button
              type="button"
              className={PRIMARY}
              onClick={onSendComment}
              disabled={disabled || comment.trim().length === 0}
            >
              Send comment
            </button>
          </div>
        </div>
      ) : null}
      {state.error ? (
        <p className="text-caption text-danger-500" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

/** Free-form text response — used by goal-clarification, merge-conflict, escalation. */
export function FreeFormActions({ checkpoint, onAnswer }: CheckpointActionsProps) {
  const [state, setState] = useState<SubmitState>(IDLE);
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const canSend = !state.busy && trimmed.length > 0;
  const onSend = (): void => void submit(checkpoint.id, trimmed, onAnswer, setState);

  return (
    <div data-testid={`actions-${checkpoint.id}`} className="flex flex-col gap-2">
      <label className="sr-only" htmlFor={`response-${checkpoint.id}`}>
        Response
      </label>
      <textarea
        id={`response-${checkpoint.id}`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a response…"
        rows={3}
        className="w-full rounded-card bg-surface-900 px-3 py-2 text-body text-text-50 placeholder:text-text-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        disabled={state.busy}
      />
      <div className="flex items-center justify-end gap-3">
        {state.error ? (
          <p className="text-caption text-danger-500" role="alert">
            {state.error}
          </p>
        ) : null}
        <button
          type="button"
          className={cn(PRIMARY, !canSend && 'pointer-events-none')}
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send response"
        >
          Send
        </button>
      </div>
    </div>
  );
}

const BUDGET_OPTIONS = [
  { value: 'stop', label: 'Stop run', cls: DESTRUCTIVE },
  { value: 'increase', label: 'Increase cap', cls: PRIMARY },
  { value: 'continue-once', label: 'Continue once', cls: SECONDARY },
] as const;

/** Stop / Increase / Continue once — used only by budget-exceeded. */
export function BudgetActions({ checkpoint, onAnswer }: CheckpointActionsProps) {
  const [state, setState] = useState<SubmitState>(IDLE);
  return (
    <div data-testid={`actions-${checkpoint.id}`} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {BUDGET_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={opt.cls}
            onClick={() => void submit(checkpoint.id, opt.value, onAnswer, setState)}
            disabled={state.busy}
            aria-label={opt.label}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {state.error ? (
        <p className="text-caption text-danger-500" role="alert">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
