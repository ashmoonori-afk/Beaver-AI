// Thin wrapper around node:sqlite (DatabaseSync).
// Exposes openDb() that returns a ready-to-use connection with WAL +
// foreign keys on. Callers (DAOs, migration runner) own the lifetime;
// closeDb is a tiny convenience.

import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

export interface OpenDbOptions {
  /** File path or ':memory:'. */
  path: string;
  /**
   * Set WAL journal mode. Defaults to true. WAL is a no-op on `:memory:`
   * databases (sqlite reports `memory` regardless), so callers that want a
   * durable WAL test must pass a real file path.
   */
  wal?: boolean;
}

export function openDb({ path, wal = true }: OpenDbOptions): Db {
  const db = new DatabaseSync(path);
  // Foreign keys must be enabled per-connection in sqlite.
  db.exec('PRAGMA foreign_keys = ON');
  if (wal) db.exec('PRAGMA journal_mode = WAL');
  return db;
}

export function closeDb(db: Db): void {
  db.close();
}

/** Returns the current journal_mode pragma (lower-case, e.g. 'wal'). */
export function journalMode(db: Db): string {
  const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
  return row.journal_mode;
}
