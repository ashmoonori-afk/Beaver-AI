// DAO for the `agents` table. Each row represents a single provider session
// bound to one task's worktree branch. No business logic.

import { z } from 'zod';

import type { Db } from '../db.js';

export const AgentRowSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  provider: z.string(),
  worktree_path: z.string(),
  branch: z.string(),
  status: z.string(),
  budget_usd: z.number(),
  spent_usd: z.number(),
});
export type AgentRow = z.infer<typeof AgentRowSchema>;

export interface InsertAgentInput {
  id: string;
  task_id: string;
  provider: string;
  worktree_path: string;
  branch: string;
  status: string;
  budget_usd: number;
}

export function insertAgent(db: Db, input: InsertAgentInput): AgentRow {
  db.prepare(
    `INSERT INTO agents (id, task_id, provider, worktree_path, branch, status, budget_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    input.task_id,
    input.provider,
    input.worktree_path,
    input.branch,
    input.status,
    input.budget_usd,
  );
  const row = getAgent(db, input.id);
  if (!row) throw new Error(`insertAgent: row missing after insert (id=${input.id})`);
  return row;
}

export function getAgent(db: Db, id: string): AgentRow | null {
  const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
  if (!row) return null;
  return AgentRowSchema.parse(row);
}

export function updateAgentStatus(db: Db, id: string, status: string): void {
  db.prepare('UPDATE agents SET status = ? WHERE id = ?').run(status, id);
}

export function listAgentsByTask(db: Db, taskId: string): AgentRow[] {
  const rows = db.prepare('SELECT * FROM agents WHERE task_id = ? ORDER BY id').all(taskId);
  return rows.map((r) => AgentRowSchema.parse(r));
}
