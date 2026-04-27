// DAO for the `plans` table. Owns row shape (zod), insert/get/list helpers.
// No business logic: version-bumping, parent-resolution, etc. live elsewhere.
// SQL strings are inlined per repo convention.

import { z } from 'zod';

import type { Db } from '../db.js';

export const PlanRowSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  version: z.number().int(),
  parent_version: z.number().int().nullable(),
  modified_by: z.string().nullable(),
  content_path: z.string(),
});
export type PlanRow = z.infer<typeof PlanRowSchema>;

export interface InsertPlanInput {
  id: string;
  run_id: string;
  version: number;
  parent_version?: number;
  modified_by?: string;
  content_path: string;
}

export function insertPlan(db: Db, input: InsertPlanInput): PlanRow {
  db.prepare(
    `INSERT INTO plans (id, run_id, version, parent_version, modified_by, content_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.run_id,
    input.version,
    input.parent_version ?? null,
    input.modified_by ?? null,
    input.content_path,
  );
  const row = getPlan(db, input.id);
  if (!row) throw new Error(`insertPlan: row missing after insert (id=${input.id})`);
  return row;
}

export function getPlan(db: Db, id: string): PlanRow | null {
  const row = db.prepare('SELECT * FROM plans WHERE id = ?').get(id);
  if (!row) return null;
  return PlanRowSchema.parse(row);
}

export function getPlanByRunVersion(db: Db, runId: string, version: number): PlanRow | null {
  const row = db
    .prepare('SELECT * FROM plans WHERE run_id = ? AND version = ?')
    .get(runId, version);
  if (!row) return null;
  return PlanRowSchema.parse(row);
}

export function getLatestPlanForRun(db: Db, runId: string): PlanRow | null {
  const row = db
    .prepare('SELECT * FROM plans WHERE run_id = ? ORDER BY version DESC LIMIT 1')
    .get(runId);
  if (!row) return null;
  return PlanRowSchema.parse(row);
}

export function listPlansByRun(db: Db, runId: string): PlanRow[] {
  const rows = db.prepare('SELECT * FROM plans WHERE run_id = ? ORDER BY version ASC').all(runId);
  return rows.map((r) => PlanRowSchema.parse(r));
}
