// DAO for the `tasks` table. depends_on_json is kept as the raw JSON string
// for v0.1; downstream code can JSON.parse if needed. No business logic.

import { z } from 'zod';

import type { Db } from '../db.js';

export const TaskRowSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  parent_id: z.string().nullable(),
  role: z.string(),
  status: z.string(),
  depends_on_json: z.string(),
  budget_usd: z.number().nullable(),
  spent_usd: z.number(),
});
export type TaskRow = z.infer<typeof TaskRowSchema>;

export interface InsertTaskInput {
  id: string;
  run_id: string;
  parent_id?: string | null;
  role: string;
  status: string;
  depends_on_json?: string;
  budget_usd?: number | null;
}

export function insertTask(db: Db, input: InsertTaskInput): TaskRow {
  db.prepare(
    `INSERT INTO tasks (id, run_id, parent_id, role, status, depends_on_json, budget_usd)
     VALUES (?, ?, ?, ?, ?, COALESCE(?, '[]'), ?)`,
  ).run(
    input.id,
    input.run_id,
    input.parent_id ?? null,
    input.role,
    input.status,
    input.depends_on_json ?? null,
    input.budget_usd ?? null,
  );
  const row = getTask(db, input.id);
  if (!row) throw new Error(`insertTask: row missing after insert (id=${input.id})`);
  return row;
}

export function getTask(db: Db, id: string): TaskRow | null {
  const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!row) return null;
  return TaskRowSchema.parse(row);
}

export function updateTaskStatus(db: Db, id: string, status: string): void {
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
}

export function listTasksByRun(db: Db, runId: string): TaskRow[] {
  const rows = db.prepare('SELECT * FROM tasks WHERE run_id = ? ORDER BY id').all(runId);
  return rows.map((r) => TaskRowSchema.parse(r));
}
