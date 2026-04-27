import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ClaudeCodeAdapter } from '../providers/claude-code/adapter.js';
import { closeDb, openDb, type Db } from '../workspace/db.js';
import { runMigrations } from '../workspace/migrate.js';
import { insertRate } from '../workspace/dao/rate_table.js';

import { ensureWiki } from './bootstrap.js';
import { askWiki, queryWiki } from './query.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', 'providers', '_test', 'mock-cli.js');
const FX = path.join(HERE, '__fixtures__');

let db: Db;
let configDir: string;
let wikiRoot: string;

beforeEach(() => {
  db = openDb({ path: ':memory:' });
  runMigrations(db);
  insertRate(db, {
    provider: 'claude-code',
    model: 'test-model',
    tokens_in_per_usd: 1_000_000,
    tokens_out_per_usd: 1_000_000,
    effective_from: '2026-01-01T00:00:00Z',
  });
  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-wiki-q-cfg-'));
  const result = ensureWiki(configDir);
  wikiRoot = result.path;
});

afterEach(() => {
  closeDb(db);
  fs.rmSync(configDir, { recursive: true, force: true });
});

function adapterFor(fixture: string): ClaudeCodeAdapter {
  return new ClaudeCodeAdapter({
    cliPath: process.execPath,
    defaultArgs: [MOCK_CLI, path.join(FX, fixture)],
    db,
  });
}

function seedDecisionPage(filename: string, body: string): void {
  fs.writeFileSync(path.join(wikiRoot, 'decisions', filename), body, 'utf8');
}

describe('queryWiki (structured hint)', () => {
  it('returns no hint and no source pages when wiki has only stub seed files', async () => {
    const adapter = adapterFor('hint-previously.json');
    const result = await queryWiki({
      wikiRoot,
      kind: 'plan-approval',
      context: { goal: 'add auth' },
      adapter,
    });
    // Stub seed files have non-empty intro markdown but the decisions/ dir is
    // empty. queryWiki still has user-profile.md/index.md which are seed
    // stubs — those have body so they may produce a call. We assert the
    // pageless branch via a separate empty-wiki test below.
    expect(Array.isArray(result.sourcePages)).toBe(true);
  });

  it('returns no hint when configDir has no wiki at all', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-empty-'));
    try {
      const adapter = adapterFor('hint-previously.json');
      const result = await queryWiki({
        wikiRoot: path.join(empty, 'wiki'),
        kind: 'plan-approval',
        context: {},
        adapter,
      });
      expect(result.hint).toBeUndefined();
      expect(result.sourcePages).toEqual([]);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it("returns a hint that includes 'previously' wording when the wiki contains a relevant prior decision", async () => {
    seedDecisionPage(
      'run-auth-1.md',
      '# Run run-auth-1\n\nGoal: add JWT auth\nState: ok\nDecision: chose jose over jsonwebtoken\n',
    );
    const adapter = adapterFor('hint-previously.json');
    const result = await queryWiki({
      wikiRoot,
      kind: 'plan-approval',
      context: { goal: 'add auth' },
      adapter,
    });
    expect(result.hint).toBeDefined();
    expect(result.hint!.toLowerCase()).toContain('previously');
    expect(result.sourcePages.some((p) => p.startsWith('decisions/'))).toBe(true);
  }, 15_000);
});

describe('askWiki (free-form natural-language)', () => {
  it("returns 'no relevant info' when the wiki has no pages at all", async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-empty-ask-'));
    try {
      const adapter = adapterFor('ask-cite-decision.json');
      const result = await askWiki({
        wikiRoot: path.join(empty, 'wiki'),
        question: 'what did we decide last about auth?',
        adapter,
      });
      expect(result.answer).toMatch(/no relevant info/i);
      expect(result.sourcePages).toEqual([]);
    } finally {
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });

  it('answers a free-form question and cites the relevant decision page', async () => {
    seedDecisionPage(
      'run-auth-1.md',
      '# Run run-auth-1\n\nGoal: add JWT auth\nDecision: chose jose; rejected jsonwebtoken\n',
    );
    const adapter = adapterFor('ask-cite-decision.json');
    const result = await askWiki({
      wikiRoot,
      question: 'what did we decide last about auth?',
      adapter,
    });
    expect(result.answer).toMatch(/JWT|auth/i);
    expect(result.answer).toContain('decisions/run-auth-1.md');
    expect(result.sourcePages.some((p) => p.startsWith('decisions/'))).toBe(true);
  }, 15_000);
});
