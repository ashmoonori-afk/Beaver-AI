// PRD task dispatcher. v0.2 M2.3.
//
// Pulls the next pending row from prd_tasks, calls a coder adapter
// with prompts/coder-task.md + the acceptance item, optionally calls
// the M2.5 reviewer, and toggles status + the prd.md checkbox in the
// workspace. Loops until the checklist is exhausted or a task fails
// past its retry cap.
//
// Separate from packages/core/src/orchestrator/loop.ts on purpose —
// the v0.1 plan-driven dispatch path stays untouched (KR5: zero v0.1
// regression). The orchestrator picks between the two based on
// whether prd.md exists for this run.

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ProviderAdapter, RunOptions, RunResult } from '../types/provider.js';
import type { Db } from '../workspace/db.js';
import { insertEvent } from '../workspace/dao/events.js';
import {
  insertPrdTask,
  listPrdTasksByRunId,
  nextPendingPrdTask,
  updatePrdTaskStatus,
  type PrdTaskRow,
} from '../workspace/dao/prd_tasks.js';

import { parseAcceptanceChecklist } from './parse-acceptance.js';
import type { PrdReviewer, PrdReviewResult } from './reviewer.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = (() => {
  const dev = path.join(HERE, 'prompts');
  if (fs.existsSync(dev)) return dev;
  return path.join(HERE, 'prd-prompts');
})();
const CODER_PROMPT_FILE = 'coder-task.md';

const SOURCE = 'prd-dispatcher';
/** Per PRD M2.5 — three attempts max before escalation. */
export const MAX_PRD_TASK_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 300_000;

export interface DispatcherEvent {
  /** Subscribed by callers (Tauri shell, CLI) so the UI can show
   *  per-task progress without re-reading the events table. */
  type: 'task.start' | 'task.done' | 'task.failed' | 'review.verdict' | 'dispatch.completed';
  taskId?: string;
  idx?: number;
  text?: string;
  attempt?: number;
  verdict?: 'pass' | 'fail';
  reason?: string;
}

export interface DispatchInput {
  db: Db;
  /** Orchestrator run id — the parent runs.id row. */
  runId: string;
  /** prd_runs.id from the M1.5 freeze. Required so the dispatcher can
   *  trace each task back to a specific PRD revision. */
  prdRunId: string;
  /** Workspace root holding prd.md. Edits land here. */
  repoRoot: string;
  /** Coder adapter to call per task. */
  adapter: ProviderAdapter;
  /** Reviewer closure. When undefined, the dispatcher operates in
   *  --always-accept mode (M2.6) — every task is marked done after
   *  the coder returns without invoking the reviewer. */
  reviewer?: PrdReviewer;
  /** Optional event sink for UI streaming (M2.7 wiring). */
  onEvent?: (event: DispatcherEvent) => void;
  /** Per-task timeout passed to adapter.run. Default 5 min. */
  timeoutMs?: number;
}

export interface DispatchResult {
  totalTasks: number;
  completed: number;
  failed: number;
  /** First task id that exhausted retries — present iff failed > 0. */
  firstFailedTaskId?: string;
}

/** Top-level entry. Reads <repoRoot>/.beaver/prd.md, seeds prd_tasks,
 *  loops over pending rows. Idempotent: re-running on a partially
 *  done run picks up where it left off (status='running' rows are
 *  reset to 'pending' on entry to recover from sidecar crashes). */
export async function dispatchPrdTasks(input: DispatchInput): Promise<DispatchResult> {
  await seedTasksFromPrd(input);
  resetRunningRows(input.db, input.runId);

  const systemPrompt = fs.readFileSync(path.join(PROMPTS_DIR, CODER_PROMPT_FILE), 'utf8');
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let completed = 0;
  let failed = 0;
  let firstFailedTaskId: string | undefined;

  for (;;) {
    const task = nextPendingPrdTask(input.db, input.runId);
    if (!task) break;
    const outcome = await runOneTask(task, input, systemPrompt, timeoutMs);
    if (outcome === 'done') completed += 1;
    else {
      failed += 1;
      if (firstFailedTaskId === undefined) firstFailedTaskId = task.id;
      // Stop on first failure — the orchestrator escalates.
      break;
    }
  }

  input.onEvent?.({ type: 'dispatch.completed' });
  insertEvent(input.db, {
    run_id: input.runId,
    ts: new Date().toISOString(),
    source: SOURCE,
    type: 'dispatch.completed',
    payload_json: JSON.stringify({ completed, failed }),
  });
  const total = listPrdTasksByRunId(input.db, input.runId).length;
  const result: DispatchResult = {
    totalTasks: total,
    completed,
    failed,
  };
  if (firstFailedTaskId !== undefined) result.firstFailedTaskId = firstFailedTaskId;
  return result;
}

/** Read the workspace's prd.md, parse the Acceptance section, insert
 *  one prd_tasks row per item. No-op when rows already exist for
 *  this run (idempotent under crash + replay). Records a clear
 *  `dispatch.no_tasks` audit event when the parser yielded 0 items
 *  so the user sees why the run finishes with no coding done. */
async function seedTasksFromPrd(input: DispatchInput): Promise<void> {
  const existing = listPrdTasksByRunId(input.db, input.runId);
  if (existing.length > 0) return;
  const prdPath = path.join(input.repoRoot, '.beaver', 'prd.md');
  const body = await fs.promises.readFile(prdPath, 'utf8');
  const parsed = parseAcceptanceChecklist(body);
  if (parsed.items.length === 0) {
    insertEvent(input.db, {
      run_id: input.runId,
      ts: new Date().toISOString(),
      source: SOURCE,
      type: 'dispatch.no_tasks',
      payload_json: JSON.stringify({
        reason:
          parsed.warnings.length > 0
            ? `Acceptance section had ${parsed.warnings.length} malformed checkbox line(s) but no parseable - [ ] items.`
            : 'No parseable - [ ] items found in prd.md ## Acceptance section.',
        warningSamples: parsed.warnings.slice(0, 3),
      }),
    });
  }
  for (const item of parsed.items) {
    insertPrdTask(input.db, {
      id: `prdtask-${randomUUID()}`,
      run_id: input.runId,
      prd_run_id: input.prdRunId,
      idx: item.idx,
      text: item.text,
      status: item.done ? 'done' : 'pending',
    });
  }
}

/** Recover from a previous sidecar crash mid-task by resetting
 *  `running` rows back to `pending`. The retry cap (max 3 attempts)
 *  still applies via attempt_count, so a runaway can't loop. */
function resetRunningRows(db: Db, runId: string): void {
  db.prepare(
    "UPDATE prd_tasks SET status = 'pending' WHERE run_id = ? AND status = 'running'",
  ).run(runId);
}

async function runOneTask(
  task: PrdTaskRow,
  input: DispatchInput,
  systemPrompt: string,
  timeoutMs: number,
): Promise<'done' | 'failed'> {
  let lastReview: PrdReviewResult | undefined;
  for (let attempt = task.attempt_count; attempt < MAX_PRD_TASK_ATTEMPTS; attempt += 1) {
    const startedAt = new Date().toISOString();
    updatePrdTaskStatus(input.db, task.id, 'running', { startedAt, bumpAttempt: true });
    input.onEvent?.({ type: 'task.start', taskId: task.id, idx: task.idx, text: task.text, attempt });
    insertEvent(input.db, {
      run_id: input.runId,
      ts: startedAt,
      source: SOURCE,
      type: 'task.start',
      payload_json: JSON.stringify({ taskId: task.id, idx: task.idx, attempt }),
    });

    const userPrompt = buildCoderUserPrompt(task.text, attempt, lastReview);
    const runOpts: RunOptions = {
      prompt: userPrompt,
      workdir: input.repoRoot,
      systemPrompt,
      timeoutMs,
    };
    let agentResult: RunResult | undefined;
    try {
      agentResult = await input.adapter.run(runOpts);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      lastReview = { verdict: 'fail', reason: `coder threw: ${reason}` };
      continue;
    }

    const diffText = agentResult.summary ?? '';
    const review: PrdReviewResult = input.reviewer
      ? await input.reviewer({ acceptanceItem: task.text, diff: diffText })
      : { verdict: 'pass', reason: '--always-accept' };
    lastReview = review;

    input.onEvent?.({
      type: 'review.verdict',
      taskId: task.id,
      verdict: review.verdict,
      reason: review.reason,
      attempt,
    });
    insertEvent(input.db, {
      run_id: input.runId,
      ts: new Date().toISOString(),
      source: SOURCE,
      type: 'review.verdict',
      payload_json: JSON.stringify({ taskId: task.id, attempt, ...review }),
    });

    if (review.verdict === 'pass') {
      const finishedAt = new Date().toISOString();
      updatePrdTaskStatus(input.db, task.id, 'done', { finishedAt });
      // Toggle the corresponding `[ ]` to `[x]` in prd.md so a manual
      // editor sees progress. Best-effort — a write failure is logged
      // but doesn't fail the task.
      await togglePrdCheckbox(input.repoRoot, task.idx).catch(() => {
        /* ignore — prd.md edit is cosmetic */
      });
      input.onEvent?.({ type: 'task.done', taskId: task.id, idx: task.idx });
      insertEvent(input.db, {
        run_id: input.runId,
        ts: finishedAt,
        source: SOURCE,
        type: 'task.done',
        payload_json: JSON.stringify({ taskId: task.id, idx: task.idx, attempts: attempt + 1 }),
      });
      return 'done';
    }
    // Else: fail; loop will retry up to MAX_PRD_TASK_ATTEMPTS.
  }

  // Exhausted retries.
  const finishedAt = new Date().toISOString();
  updatePrdTaskStatus(input.db, task.id, 'failed', { finishedAt });
  input.onEvent?.({
    type: 'task.failed',
    taskId: task.id,
    idx: task.idx,
    reason: lastReview?.reason,
  });
  insertEvent(input.db, {
    run_id: input.runId,
    ts: finishedAt,
    source: SOURCE,
    type: 'task.failed',
    payload_json: JSON.stringify({
      taskId: task.id,
      idx: task.idx,
      attempts: MAX_PRD_TASK_ATTEMPTS,
      reason: lastReview?.reason,
    }),
  });
  return 'failed';
}

function buildCoderUserPrompt(
  acceptanceItem: string,
  attempt: number,
  lastReview: PrdReviewResult | undefined,
): string {
  const lines = [`acceptanceItem: ${acceptanceItem}`, `attempt: ${attempt}`];
  if (lastReview && lastReview.verdict === 'fail') {
    lines.push(`previousReason: ${lastReview.reason}`);
    if (lastReview.retryHint) {
      lines.push(`retryHint: ${lastReview.retryHint}`);
    }
  }
  return lines.join('\n');
}

/** Replace the n-th `- [ ]` line in <repoRoot>/.beaver/prd.md with
 *  `- [x]`. Counts only top-level acceptance items, in idx order. */
async function togglePrdCheckbox(repoRoot: string, idx: number): Promise<void> {
  const prdPath = path.join(repoRoot, '.beaver', 'prd.md');
  const original = await fs.promises.readFile(prdPath, 'utf8');
  const lines = original.split('\n');
  let inAcceptance = false;
  let acceptanceLevel = 0;
  let inFence = false;
  let counter = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
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
      if (inAcceptance && depth <= acceptanceLevel) {
        inAcceptance = false;
      }
      continue;
    }
    if (!inAcceptance) continue;
    const item = /^(\s*-\s+\[)( |x|X)(\]\s+.*)$/.exec(line);
    if (!item) continue;
    if (counter === idx) {
      lines[i] = `${item[1]}x${item[3]}`;
      await fs.promises.writeFile(prdPath, lines.join('\n'), 'utf8');
      return;
    }
    counter += 1;
  }
}
