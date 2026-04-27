// Shared helpers for subcommand handlers.
//
// - resolveDbPath: where the SQLite ledger lives (override via BEAVER_DB env).
// - withDb: open + run + always close, returning the handler's exit code.
// - println / printerr: the *only* place handlers are allowed to write to
//   stdout/stderr, per the ui-policy "renderer is the only writer" rule.

import path from 'node:path';

import { closeDb, openDb, runMigrations, type Db } from '@beaver-ai/core';

export function resolveDbPath(): string {
  const env = process.env['BEAVER_DB'];
  if (env && env.length > 0) return env;
  return path.join(process.cwd(), '.beaver', 'beaver.db');
}

export function println(s: string): void {
  process.stdout.write(s + '\n');
}

export function printerr(s: string): void {
  process.stderr.write(s + '\n');
}

export interface WithDbOptions {
  /** Default false; init runs migrations explicitly via Beaver.init(). */
  migrate?: boolean;
}

export async function withDb<T>(
  fn: (db: Db) => Promise<T> | T,
  opts: WithDbOptions = {},
): Promise<T> {
  const db = openDb({ path: resolveDbPath() });
  try {
    if (opts.migrate) runMigrations(db);
    return await fn(db);
  } finally {
    closeDb(db);
  }
}
