// DAO for the `events` table.
//
// APPEND-ONLY at the API level. Per T4 of docs/phase-0-foundations.md
// (Sprint 0.3): the events table is immutable from the DAO's perspective —
// we expose insert + read methods only. There is intentionally NO
// updateEvent and NO deleteEvent. The TypeScript module surface enforces
// this at typecheck time; a runtime guard test in events.test.ts pins the
// contract.

import { z } from 'zod';

import type { Db } from '../db.js';

export const EventRowSchema = z.object({
  id: z.number().int(),
  run_id: z.string(),
  ts: z.string(),
  source: z.string(),
  type: z.string(),
  payload_json: z.string().nullable(),
});
export type EventRow = z.infer<typeof EventRowSchema>;

export interface InsertEventInput {
  run_id: string;
  ts: string;
  source: string;
  type: string;
  payload_json?: string | null;
}

export function insertEvent(db: Db, input: InsertEventInput): EventRow {
  const result = db
    .prepare(
      `INSERT INTO events (run_id, ts, source, type, payload_json)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.run_id, input.ts, input.source, input.type, input.payload_json ?? null);
  const id = Number(result.lastInsertRowid);
  const row = getEvent(db, id);
  if (!row) throw new Error(`insertEvent: row missing after insert (id=${id})`);
  return row;
}

export function getEvent(db: Db, id: number): EventRow | null {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!row) return null;
  return EventRowSchema.parse(row);
}

export function listEventsByRun(db: Db, runId: string): EventRow[] {
  const rows = db.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY ts, id').all(runId);
  return rows.map((r) => EventRowSchema.parse(r));
}

export function listEventsByType(db: Db, runId: string, type: string): EventRow[] {
  const rows = db
    .prepare('SELECT * FROM events WHERE run_id = ? AND type = ? ORDER BY ts, id')
    .all(runId, type);
  return rows.map((r) => EventRowSchema.parse(r));
}
