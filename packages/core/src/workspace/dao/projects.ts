// DAO for the `projects` table. Owns row shape (zod) and basic CRUD reads.
// No business logic; SQL strings are inlined per repo convention.

import { z } from 'zod';

import type { Db } from '../db.js';

export const ProjectRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  root_path: z.string(),
  created_at: z.string(),
  config_json: z.string().nullable(),
});
export type ProjectRow = z.infer<typeof ProjectRowSchema>;

export interface InsertProjectInput {
  id: string;
  name: string;
  root_path: string;
  created_at: string;
  config_json?: string | null;
}

export function insertProject(db: Db, input: InsertProjectInput): ProjectRow {
  db.prepare(
    `INSERT INTO projects (id, name, root_path, created_at, config_json)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(input.id, input.name, input.root_path, input.created_at, input.config_json ?? null);
  const row = getProject(db, input.id);
  if (!row) throw new Error(`insertProject: row missing after insert (id=${input.id})`);
  return row;
}

export function getProject(db: Db, id: string): ProjectRow | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!row) return null;
  return ProjectRowSchema.parse(row);
}

export function listProjects(db: Db): ProjectRow[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY created_at').all();
  return rows.map((r) => ProjectRowSchema.parse(r));
}
