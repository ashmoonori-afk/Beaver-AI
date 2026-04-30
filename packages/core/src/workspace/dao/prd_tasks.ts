// DAO for the v0.2 `prd_tasks` table. One row per `- [ ]` item parsed
// from the frozen prd.md `## Acceptance` section. Mirrors the existing
// DAO style: zod row shape, inlined SQL, no business logic.

import { z } from 'zod';

import type { Db } from '../db.js';

export const PRD_TASK_STATUSES = ['pending', 'running', 'done', 'failed'] as const;
export type PrdTaskStatus = (typeof PRD_TASK_STATUSES)[number];

export const PrdTaskRowSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  prd_run_id: z.string(),
  idx: z.number().int(),
  text: z.string(),
  status: z.enum(PRD_TASK_STATUSES),
  attempt_count: z.number().int(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});
export type PrdTaskRow = z.infer<typeof PrdTaskRowSchema>;

export interface InsertPrdTaskInput {
  id: string;
  run_id: string;
  prd_run_id: string;
  idx: number;
  text: string;
  status?: PrdTaskStatus;
}

/** Insert a fresh prd_task row. Defaults status to 'pending' so the
 *  parser only needs to provide identity + text. */
export function insertPrdTask(db: Db, input: InsertPrdTaskInput): PrdTaskRow {
  const status = input.status ?? 'pending';
  db.prepare(
    `INSERT INTO prd_tasks (id, run_id, prd_run_id, idx, text, status, attempt_count)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  ).run(input.id, input.run_id, input.prd_run_id, input.idx, input.text, status);
  const row = getPrdTaskById(db, input.id);
  if (!row) throw new Error(`insertPrdTask: row missing after insert (id=${input.id})`);
  return row;
}

export function getPrdTaskById(db: Db, id: string): PrdTaskRow | null {
  const row = db.prepare('SELECT * FROM prd_tasks WHERE id = ?').get(id);
  if (!row) return null;
  return PrdTaskRowSchema.parse(row);
}

/** All rows for a run, in stable idx order. */
export function listPrdTasksByRunId(db: Db, runId: string): PrdTaskRow[] {
  const rows = db.prepare('SELECT * FROM prd_tasks WHERE run_id = ? ORDER BY idx').all(runId);
  return rows.map((r) => PrdTaskRowSchema.parse(r));
}

/** Pull the next pending task in idx order. Returns null when the
 *  checklist is exhausted. The dispatcher uses this to know when the
 *  PRD is fully consumed and the run can advance to final review. */
export function nextPendingPrdTask(db: Db, runId: string): PrdTaskRow | null {
  const row = db
    .prepare("SELECT * FROM prd_tasks WHERE run_id = ? AND status = 'pending' ORDER BY idx LIMIT 1")
    .get(runId);
  if (!row) return null;
  return PrdTaskRowSchema.parse(row);
}

/** Update status + lifecycle timestamps in one shot. The dispatcher
 *  calls this on start (status='running'), the reviewer on
 *  pass/fail. Attempt count is bumped only on retry transitions. */
export function updatePrdTaskStatus(
  db: Db,
  id: string,
  status: PrdTaskStatus,
  opts: { startedAt?: string; finishedAt?: string; bumpAttempt?: boolean } = {},
): void {
  const sets: string[] = ['status = ?'];
  const values: (string | number)[] = [status];
  if (opts.startedAt !== undefined) {
    sets.push('started_at = ?');
    values.push(opts.startedAt);
  }
  if (opts.finishedAt !== undefined) {
    sets.push('finished_at = ?');
    values.push(opts.finishedAt);
  }
  if (opts.bumpAttempt === true) {
    sets.push('attempt_count = attempt_count + 1');
  }
  values.push(id);
  db.prepare(`UPDATE prd_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}
