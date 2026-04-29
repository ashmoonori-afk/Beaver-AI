// DAO for the v0.2 `log_lines` table. Coder/reviewer stdout/stderr
// streamed line-by-line for the M3.3 LivePane log list.

import { z } from 'zod';

import type { Db } from '../db.js';

export const LogLineRowSchema = z.object({
  id: z.number().int(),
  run_id: z.string(),
  ts: z.string(),
  source: z.string(),
  stream: z.string(),
  text: z.string(),
});
export type LogLineRow = z.infer<typeof LogLineRowSchema>;

export interface InsertLogLineInput {
  run_id: string;
  ts: string;
  source: string;
  stream: 'stdout' | 'stderr';
  text: string;
}

/** Append one log line. Returns the row including its auto-id so the
 *  caller can use the id as a virtualization cursor. */
export function insertLogLine(db: Db, input: InsertLogLineInput): LogLineRow {
  const result = db
    .prepare(
      `INSERT INTO log_lines (run_id, ts, source, stream, text)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.run_id, input.ts, input.source, input.stream, input.text);
  const id = Number(result.lastInsertRowid);
  return {
    id,
    run_id: input.run_id,
    ts: input.ts,
    source: input.source,
    stream: input.stream,
    text: input.text,
  };
}

/** Tail rows newer than `sinceId`. Default `since=-1` returns all
 *  rows. Cap at `limit` so a paused renderer cannot blow up the IPC
 *  payload after a long sleep. */
export function listLogLinesSince(
  db: Db,
  runId: string,
  sinceId: number,
  limit = 5_000,
): LogLineRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM log_lines
       WHERE run_id = ? AND id > ?
       ORDER BY id
       LIMIT ?`,
    )
    .all(runId, sinceId, limit);
  return rows.map((r) => LogLineRowSchema.parse(r));
}
