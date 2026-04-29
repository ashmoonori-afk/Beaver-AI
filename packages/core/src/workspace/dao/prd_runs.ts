// DAO for the v0.2 `prd_runs` table. One row per ConfirmGate freeze.
// Mirrors the existing DAO style (zod row shape, inlined SQL, no
// business logic). Migration 002_prd_runs.sql owns the schema.

import { z } from 'zod';

import type { Db } from '../db.js';

export const PrdRunRowSchema = z.object({
  id: z.string(),
  run_id: z.string(),
  frozen_at: z.string(),
  prd_path: z.string(),
  prompt_path: z.string(),
});
export type PrdRunRow = z.infer<typeof PrdRunRowSchema>;

export interface InsertPrdRunInput {
  id: string;
  run_id: string;
  frozen_at: string;
  prd_path: string;
  prompt_path: string;
}

/** Insert a new prd_runs row. Throws on duplicate id (PK violation)
 *  so a double-click on Confirm cannot quietly duplicate the freeze. */
export function insertPrdRun(db: Db, input: InsertPrdRunInput): PrdRunRow {
  db.prepare(
    `INSERT INTO prd_runs (id, run_id, frozen_at, prd_path, prompt_path)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.id, input.run_id, input.frozen_at, input.prd_path, input.prompt_path);
  const row = getPrdRunById(db, input.id);
  if (!row) throw new Error(`insertPrdRun: row missing after insert (id=${input.id})`);
  return row;
}

/** Lookup by primary key. */
export function getPrdRunById(db: Db, id: string): PrdRunRow | null {
  const row = db.prepare('SELECT * FROM prd_runs WHERE id = ?').get(id);
  if (!row) return null;
  return PrdRunRowSchema.parse(row);
}

/** Fetch every freeze that belongs to a given orchestrator run, in
 *  insertion order. Most runs have exactly one — multi-row support
 *  is for v0.2.x's "amend PRD mid-run" scenario. */
export function listPrdRunsByRunId(db: Db, runId: string): PrdRunRow[] {
  const rows = db
    .prepare('SELECT * FROM prd_runs WHERE run_id = ? ORDER BY frozen_at')
    .all(runId);
  return rows.map((r) => PrdRunRowSchema.parse(r));
}
