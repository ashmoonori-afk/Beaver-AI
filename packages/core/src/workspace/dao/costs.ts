// DAO for the `costs` table. Append-only ledger of LLM spend per agent/run.
// Owns row shape (zod), insert (returns the AUTOINCREMENT id), single-row get,
// chronological list, and per-run / per-agent USD sums.
// No business logic: no update path, no budget enforcement.
// SQL strings are inlined per repo convention.

import { z } from 'zod';

import type { Db } from '../db.js';

export const CostRowSchema = z.object({
  id: z.number().int(),
  run_id: z.string(),
  agent_id: z.string().nullable(),
  provider: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  usd: z.number(),
  model: z.string(),
  ts: z.string(),
});
export type CostRow = z.infer<typeof CostRowSchema>;

export interface InsertCostInput {
  run_id: string;
  agent_id?: string | null;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  usd: number;
  model: string;
  ts: string;
}

export function insertCost(db: Db, input: InsertCostInput): CostRow {
  const info = db
    .prepare(
      `INSERT INTO costs (run_id, agent_id, provider, tokens_in, tokens_out, usd, model, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.run_id,
      input.agent_id ?? null,
      input.provider,
      input.tokens_in,
      input.tokens_out,
      input.usd,
      input.model,
      input.ts,
    );
  const id = Number(info.lastInsertRowid);
  const row = getCost(db, id);
  if (!row) throw new Error(`insertCost: row missing after insert (id=${id})`);
  return row;
}

export function getCost(db: Db, id: number): CostRow | null {
  const row = db.prepare('SELECT * FROM costs WHERE id = ?').get(id);
  if (!row) return null;
  return CostRowSchema.parse(row);
}

export function listCostsByRun(db: Db, runId: string): CostRow[] {
  const rows = db
    .prepare('SELECT * FROM costs WHERE run_id = ? ORDER BY ts ASC, id ASC')
    .all(runId);
  return rows.map((r) => CostRowSchema.parse(r));
}

export function sumCostsByRun(db: Db, runId: string): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(usd), 0) AS total FROM costs WHERE run_id = ?')
    .get(runId) as { total: number };
  return row.total;
}

export function sumCostsByAgent(db: Db, agentId: string): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(usd), 0) AS total FROM costs WHERE agent_id = ?')
    .get(agentId) as { total: number };
  return row.total;
}
