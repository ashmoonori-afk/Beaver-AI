// `beaver wiki ask <question>` — query the project wiki via the LLM.
//
// Usage: `beaver wiki ask "what did we decide about auth?"` from inside
// a project directory. Bootstraps `.beaver/wiki/` on first use, then
// calls @beaver-ai/core's askWiki() against the configured Claude Code
// adapter. Prints the answer + cited pages as JSON to stdout so the
// Tauri shell can parse it and render in the Wiki tab.

import path from 'node:path';

import { Command } from 'commander';

import { ClaudeCodeAdapter, askWiki, ensureWiki, openDb, closeDb } from '@beaver-ai/core';

import { printerr, println } from './_shared.js';

interface WikiAskOutput {
  answer: string;
  sourcePages: string[];
}

export async function runWiki(argv: string[]): Promise<number> {
  const cmd = new Command('wiki')
    .description('query the project wiki')
    .argument('<subcommand>', 'subcommand: "ask"')
    .argument('[args...]', 'subcommand arguments')
    .exitOverride()
    .allowUnknownOption(true);
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`wiki: ${(e as Error).message}`);
    return 2;
  }
  const [sub, ...rest] = cmd.args;
  if (!sub) {
    printerr("wiki: missing subcommand. Try 'wiki ask <question>'.");
    return 2;
  }
  if (sub !== 'ask') {
    printerr(`wiki: unknown subcommand '${sub}'. Try 'wiki ask <question>'.`);
    return 2;
  }
  return runWikiAsk(rest);
}

async function runWikiAsk(positional: string[]): Promise<number> {
  const question = positional.join(' ').trim();
  if (!question) {
    printerr('wiki ask: missing <question>');
    return 2;
  }

  const cwd = process.cwd();
  const wikiRoot = path.join(cwd, '.beaver', 'wiki');
  const dbPath = path.join(cwd, '.beaver', 'beaver.db');

  // review-pass: single DB handle reused for both bootstrap and the
  // adapter, with one try/finally that guarantees `closeDb` on every
  // exit path (success, askWiki throw, ensureWiki throw). Previously
  // a second `openDb` was opened for the adapter and leaked on the
  // catch path.
  const db = openDb({ path: dbPath });
  try {
    ensureWiki(wikiRoot, {
      onWarn: (msg) => printerr(`wiki ask: ${msg}`),
    });
    const adapter = new ClaudeCodeAdapter({ db, providerForRate: 'claude-code' });
    const result = await askWiki({ wikiRoot, question, adapter });
    const out: WikiAskOutput = {
      answer: result.answer,
      sourcePages: result.sourcePages,
    };
    println(JSON.stringify(out));
    return 0;
  } catch (e) {
    printerr(`wiki ask: ${(e as Error).message}`);
    return 1;
  } finally {
    closeDb(db);
  }
}
