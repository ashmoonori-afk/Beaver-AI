// DAO for the `runs` table. Owns row shape (zod), insert/get/list/status-update.
// No business logic: status transitions, budget checks, etc. live elsewhere.
// SQL strings are inlined per repo convention.

import { z } from 'zod';

import type { Db } from '../db.js';

export const RunRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  goal: z.string(),
  status: z.string(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  budget_usd: z.number(),
  spent_usd: z.number(),
});
export type RunRow = z.infer<typeof RunRowSchema>;

export interface InsertRunInput {
  id: string;
  project_id: string;
  goal: string;
  status: string;
  started_at: string;
  budget_usd: number;
}

export function insertRun(db: Db, input: InsertRunInput): RunRow {
  db.prepare(
    `INSERT INTO runs (id, project_id, goal, status, started_at, budget_usd)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(input.id, input.project_id, input.goal, input.status, input.started_at, input.budget_usd);
  const row = getRun(db, input.id);
  if (!row) throw new Error(`insertRun: row missing after insert (id=${input.id})`);
  return row;
}

export function getRun(db: Db, id: string): RunRow | null {
  const row = db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
  if (!row) return null;
  return RunRowSchema.parse(row);
}

export function updateRunStatus(db: Db, id: string, status: string): void {
  db.prepare('UPDATE runs SET status = ? WHERE id = ?').run(status, id);
}

export function listRunsByProject(db: Db, projectId: string): RunRow[] {
  const rows = db
    .prepare('SELECT * FROM runs WHERE project_id = ? ORDER BY started_at')
    .all(projectId);
  return rows.map((r) => RunRowSchema.parse(r));
}
