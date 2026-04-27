// Checkpoint primitive: full lifecycle on top of the checkpoints DAO.
//
// This module owns the public API the orchestrator, sandbox hook, CLI, and
// (Phase 4) web UI use to post a question, list pending questions, write an
// answer, and block-poll for one. Validation of `kind` and per-kind response
// shape lives here (zod). No SQL — that belongs to the DAO.
//
// The polling helper is intentionally a single function (not a class) per the
// Sprint 3.1 spaghetti test.

import { z } from 'zod';

import {
  answerCheckpoint as daoAnswerCheckpoint,
  getCheckpoint,
  insertCheckpoint as daoInsertCheckpoint,
  listPendingCheckpoints,
  type CheckpointRow,
} from '../workspace/dao/checkpoints.js';
import type { Db } from '../workspace/db.js';

export const CHECKPOINT_KINDS = [
  'goal-clarification',
  'plan-approval',
  'risky-change-confirmation',
  'merge-conflict',
  'escalation',
  'final-review',
  'budget-exceeded',
] as const;

export const CheckpointKindSchema = z.enum(CHECKPOINT_KINDS);
export type CheckpointKind = z.infer<typeof CheckpointKindSchema>;

// Per-kind response shapes. Free-form `comment:<text>` is supported on
// approve-style checkpoints (plan-approval, risky-change, final-review) per
// docs/models/ux-flow.md.
const ApproveRejectComment = z
  .string()
  .refine(
    (s) => s === 'approve' || s === 'reject' || s.startsWith('comment:'),
    "expected 'approve' | 'reject' | 'comment:<text>'",
  );

const BudgetExceededResponse = z.enum(['stop', 'increase', 'continue-once']);

const FreeFormResponse = z.string().min(1, 'response must be non-empty');

const RESPONSE_SCHEMAS: Record<CheckpointKind, z.ZodType<string>> = {
  'goal-clarification': FreeFormResponse,
  'plan-approval': ApproveRejectComment,
  'risky-change-confirmation': ApproveRejectComment,
  'merge-conflict': FreeFormResponse,
  escalation: FreeFormResponse,
  'final-review': ApproveRejectComment,
  'budget-exceeded': BudgetExceededResponse,
};

export interface PostCheckpointInput {
  kind: string;
  runId: string;
  prompt: string;
}

export interface PostCheckpointResult {
  id: string;
}

/** Insert a new pending checkpoint. Validates `kind` at the API boundary. */
export function post(db: Db, input: PostCheckpointInput): PostCheckpointResult {
  const kind = CheckpointKindSchema.parse(input.kind);
  const id = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  daoInsertCheckpoint(db, {
    id,
    run_id: input.runId,
    kind,
    status: 'pending',
    prompt: input.prompt,
  });
  return { id };
}

/** List currently-pending checkpoints for a run. */
export function pendingFor(db: Db, runId: string): CheckpointRow[] {
  return listPendingCheckpoints(db, runId);
}

/** Write an answer + flip status to 'answered'. Validates response shape. */
export function answer(db: Db, id: string, response: string): void {
  const row = getCheckpoint(db, id);
  if (!row) throw new Error(`answer: no such checkpoint id='${id}'`);
  const kind = CheckpointKindSchema.parse(row.kind);
  const schema = RESPONSE_SCHEMAS[kind];
  schema.parse(response);
  daoAnswerCheckpoint(db, id, response);
}

export interface WaitForAnswerOptions {
  signal?: AbortSignal;
  pollMs?: number;
}

/**
 * Block until the named checkpoint is answered or the signal aborts.
 *
 * Polling, not LISTEN/NOTIFY: sqlite has no in-process notify and the cost is
 * trivial at the cadence we need (default 50 ms, well under the 500 ms SLA in
 * the Sprint 3.1 bug test).
 */
export function waitForAnswer(
  db: Db,
  id: string,
  opts: WaitForAnswerOptions = {},
): Promise<string> {
  const pollMs = opts.pollMs ?? 50;
  return new Promise<string>((resolve, reject) => {
    const onAbort = (): void => {
      clearInterval(timer);
      reject(new Error(`waitForAnswer: aborted (id=${id})`));
    };
    const signal = opts.signal;
    if (signal?.aborted) {
      reject(new Error(`waitForAnswer: aborted (id=${id})`));
      return;
    }
    const timer = setInterval(() => {
      try {
        const row = getCheckpoint(db, id);
        if (!row) {
          clearInterval(timer);
          if (signal) signal.removeEventListener('abort', onAbort);
          reject(new Error(`waitForAnswer: no such checkpoint id='${id}'`));
          return;
        }
        if (row.status === 'answered' && row.response !== null) {
          clearInterval(timer);
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve(row.response);
        }
      } catch (err) {
        clearInterval(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }, pollMs);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}
