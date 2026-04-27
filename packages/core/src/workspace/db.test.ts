import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { closeDb, journalMode, openDb } from './db.js';

describe('openDb', () => {
  it('returns a usable connection on :memory:', () => {
    const db = openDb({ path: ':memory:' });
    db.exec('CREATE TABLE t (x INTEGER)');
    db.prepare('INSERT INTO t (x) VALUES (?)').run(1);
    const row = db.prepare('SELECT x FROM t').get() as { x: number };
    expect(row.x).toBe(1);
    closeDb(db);
  });

  it('has foreign keys ON by default', () => {
    const db = openDb({ path: ':memory:' });
    const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
    closeDb(db);
  });

  describe('WAL mode (file-backed)', () => {
    let dir: string;
    let dbPath: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-db-test-'));
      dbPath = path.join(dir, 'test.db');
    });

    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('reports journal_mode = wal when wal=true (default)', () => {
      const db = openDb({ path: dbPath });
      expect(journalMode(db)).toBe('wal');
      closeDb(db);
    });

    it('opts out when wal=false', () => {
      const db = openDb({ path: dbPath, wal: false });
      expect(journalMode(db)).not.toBe('wal');
      closeDb(db);
    });
  });
});
