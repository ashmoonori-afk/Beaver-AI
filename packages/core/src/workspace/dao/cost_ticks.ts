// DAO for the v0.2 `cost_ticks` table. Per-tick token usage from
// coder adapters, used by the M3.4 LivePane cost counter.

import { z } from 'zod';

import type { Db } from '../db.js';

export const CostTickRowSchema = z.object({
  id: z.number().int(),
  run_id: z.string(),
  ts: z.string(),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  usd: z.number(),
});
export type CostTickRow = z.infer<typeof CostTickRowSchema>;

export interface InsertCostTickInput {
  run_id: string;
  ts: string;
  provider: string;
  model: string;
  tokens_in: number;
  tokens_out: number;
  usd: number;
}

/** Append one cost tick. */
export function insertCostTick(db: Db, input: InsertCostTickInput): void {
  db.prepare(
    `INSERT INTO cost_ticks (run_id, ts, provider, model, tokens_in, tokens_out, usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.run_id,
    input.ts,
    input.provider,
    input.model,
    input.tokens_in,
    input.tokens_out,
    input.usd,
  );
}

export interface CostTickTotals {
  tokensIn: number;
  tokensOut: number;
  usd: number;
}

/** Pre-aggregated totals over `cost_ticks`. Cheap because SQLite SUMs
 *  in the index; the LivePane cost counter polls this. */
export function getCostTickTotals(db: Db, runId: string): CostTickTotals {
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(tokens_in), 0) AS tokens_in,
         COALESCE(SUM(tokens_out), 0) AS tokens_out,
         COALESCE(SUM(usd), 0) AS usd
       FROM cost_ticks
       WHERE run_id = ?`,
    )
    .get(runId) as { tokens_in: number; tokens_out: number; usd: number };
  return {
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    usd: row.usd,
  };
}
