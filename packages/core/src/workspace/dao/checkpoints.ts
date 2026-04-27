// DAO for the `checkpoints` table. Owns row shape (zod), insert/get,
// and the two write paths the orchestrator needs: status-only update and
// answer-write (sets response + flips status to 'answered' atomically).
// No business logic: status semantics live in the orchestrator.
// SQL strings are inlined per repo convention.

import { z } from 'zod';

import type { Db } from '../db.js';

export const CheckpointRowSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  kind: z.string(),
  status: z.string(),
  prompt: z.string(),
  response: z.string().nullable(),
});
export type CheckpointRow = z.infer<typeof CheckpointRowSchema>;

export interface InsertCheckpointInput {
  id: string;
  run_id: string;
  kind: string;
  status: string;
  prompt: string;
}

export function insertCheckpoint(db: Db, input: InsertCheckpointInput): CheckpointRow {
  db.prepare(
    `INSERT INTO checkpoints (id, run_id, kind, status, prompt)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.id, input.run_id, input.kind, input.status, input.prompt);
  const row = getCheckpoint(db, input.id);
  if (!row) throw new Error(`insertCheckpoint: row missing after insert (id=${input.id})`);
  return row;
}

export function getCheckpoint(db: Db, id: string): CheckpointRow | null {
  const row = db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id);
  if (!row) return null;
  return CheckpointRowSchema.parse(row);
}

export function updateCheckpointStatus(db: Db, id: string, status: string): void {
  db.prepare('UPDATE checkpoints SET status = ? WHERE id = ?').run(status, id);
}

export function answerCheckpoint(db: Db, id: string, response: string): void {
  db.prepare("UPDATE checkpoints SET response = ?, status = 'answered' WHERE id = ?").run(
    response,
    id,
  );
}

export function listPendingCheckpoints(db: Db, runId: string): CheckpointRow[] {
  const rows = db
    .prepare("SELECT * FROM checkpoints WHERE run_id = ? AND status = 'pending'")
    .all(runId);
  return rows.map((r) => CheckpointRowSchema.parse(r));
}
