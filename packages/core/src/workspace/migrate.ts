// Idempotent migration runner over numbered SQL files in ./migrations.
// Each file's basename (without extension) is recorded in `_migrations`;
// already-applied files are skipped on re-run.
//
// The runner does NOT wrap each migration in a transaction by itself —
// SQL files may declare their own BEGIN/COMMIT if they need atomicity for
// multi-statement schema changes. v0.1's only migration is DDL-only and
// SQLite treats every CREATE TABLE as a single statement, so a transaction
// would just add noise.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Db } from './db.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = path.join(HERE, 'migrations');

const MIGRATIONS_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS _migrations (
    name        TEXT PRIMARY KEY,
    applied_at  TEXT NOT NULL
  );
`;

export interface MigrateResult {
  /** Migration filenames (without extension) that this call applied. */
  applied: string[];
  /** Migration filenames that were already in `_migrations` and skipped. */
  skipped: string[];
}

export function runMigrations(db: Db, dir: string = DEFAULT_MIGRATIONS_DIR): MigrateResult {
  db.exec(MIGRATIONS_TABLE_DDL);

  const allFiles = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const appliedRows = db.prepare('SELECT name FROM _migrations').all() as { name: string }[];
  const alreadyApplied = new Set(appliedRows.map((r) => r.name));

  const applied: string[] = [];
  const skipped: string[] = [];

  const insert = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');

  for (const file of allFiles) {
    const name = path.basename(file, '.sql');
    if (alreadyApplied.has(name)) {
      skipped.push(name);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    db.exec(sql);
    insert.run(name, new Date().toISOString());
    applied.push(name);
  }

  return { applied, skipped };
}
