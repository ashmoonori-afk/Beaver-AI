// DAO for the `rate_table`. Composite PK is (provider, model, effective_from).
// No surrogate id; lookups use the composite key. No business logic; SQL is
// inlined per repo convention.

import { z } from 'zod';

import type { Db } from '../db.js';

export const RateTableRowSchema = z.object({
  provider: z.string(),
  model: z.string(),
  tokens_in_per_usd: z.number(),
  tokens_out_per_usd: z.number(),
  effective_from: z.string(),
});
export type RateTableRow = z.infer<typeof RateTableRowSchema>;

export interface InsertRateInput {
  provider: string;
  model: string;
  tokens_in_per_usd: number;
  tokens_out_per_usd: number;
  effective_from: string;
}

export function insertRate(db: Db, input: InsertRateInput): RateTableRow {
  db.prepare(
    `INSERT INTO rate_table (provider, model, tokens_in_per_usd, tokens_out_per_usd, effective_from)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    input.provider,
    input.model,
    input.tokens_in_per_usd,
    input.tokens_out_per_usd,
    input.effective_from,
  );
  const row = getRate(db, input.provider, input.model, input.effective_from);
  if (!row) {
    throw new Error(
      `insertRate: row missing after insert (${input.provider}/${input.model}@${input.effective_from})`,
    );
  }
  return row;
}

export function getRate(
  db: Db,
  provider: string,
  model: string,
  effectiveFrom: string,
): RateTableRow | null {
  const row = db
    .prepare('SELECT * FROM rate_table WHERE provider = ? AND model = ? AND effective_from = ?')
    .get(provider, model, effectiveFrom);
  if (!row) return null;
  return RateTableRowSchema.parse(row);
}

export function getCurrentRate(
  db: Db,
  provider: string,
  model: string,
  asOf: string,
): RateTableRow | null {
  const row = db
    .prepare(
      `SELECT * FROM rate_table
       WHERE provider = ? AND model = ? AND effective_from <= ?
       ORDER BY effective_from DESC
       LIMIT 1`,
    )
    .get(provider, model, asOf);
  if (!row) return null;
  return RateTableRowSchema.parse(row);
}

export function listRatesForModel(db: Db, provider: string, model: string): RateTableRow[] {
  const rows = db
    .prepare('SELECT * FROM rate_table WHERE provider = ? AND model = ? ORDER BY effective_from')
    .all(provider, model);
  return rows.map((r) => RateTableRowSchema.parse(r));
}
