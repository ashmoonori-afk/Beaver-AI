// `beaver run [--no-server] "<goal>"` — start a new run.
// v0.1: --no-server is mandatory; --server prints the Phase 4 stub.
// One-active-run rule (D11): rejects if any RUNNING/PAUSED run exists.

import { createHash } from 'node:crypto';

import { Command } from 'commander';

import { Beaver } from 'beaver-ai';
import {
  closeDb,
  listRunsByProject,
  openDb,
  updateRunStatus,
  type AgentEvent,
} from '@beaver-ai/core';

import { color } from '../render/colors.js';
import { printerr, println, resolveDbPath } from './_shared.js';

const ACTIVE = new Set(['RUNNING', 'PAUSED']);

/** Mirror Beaver.seedProjectAndRun (api.ts) — sha256 hash of the
 *  absolute root path, sliced to 12 hex chars. Without this, the
 *  CLI's one-active-run guard would query a different project id
 *  than what Beaver wrote, silently making the guard inoperative. */
function projectIdForRoot(rootPath: string): string {
  return `p-${createHash('sha256').update(rootPath).digest('hex').slice(0, 12)}`;
}

function activeRunId(rootPath: string): string | null {
  const db = openDb({ path: resolveDbPath() });
  try {
    const rows = listRunsByProject(db, projectIdForRoot(rootPath));
    return rows.find((r) => ACTIVE.has(r.status))?.id ?? null;
  } catch {
    return null;
  } finally {
    closeDb(db);
  }
}

function abortRun(runId: string): void {
  const db = openDb({ path: resolveDbPath() });
  try {
    updateRunStatus(db, runId, 'ABORTED');
  } finally {
    closeDb(db);
  }
}

function agentText(event: AgentEvent): string | null {
  if (event.type !== 'agent.message') return null;
  if (typeof event.payload !== 'object' || event.payload === null) return null;
  const text = (event.payload as { text?: unknown }).text;
  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null;
}

export async function runRun(argv: string[]): Promise<number> {
  // Variadic <goal...> so users can type unquoted multi-word goals or
  // quoted goals where the shell may have split inner quotes. We rejoin
  // the positional args with single spaces.
  const cmd = new Command('run')
    .description('start a new run')
    .argument('<goal...>', 'natural-language goal (multi-word OK)')
    .option('--no-server', 'headless mode (mandatory in v0.1)')
    .option('--server', 'launch the local web server (Phase 4 — not landed)')
    .option('--replace-active', 'abort an existing active run before starting')
    .option('--auto-approve-final-review', 'auto-approve the final-review checkpoint')
    .option('--always-accept', 'v0.2 M2.6 — skip the PRD reviewer (every coder iteration counts as pass)')
    .exitOverride();
  try {
    cmd.parse(argv, { from: 'user' });
  } catch (e) {
    printerr(`run: ${(e as Error).message}`);
    return 2;
  }
  const opts = cmd.opts<{
    autoApproveFinalReview?: boolean;
    replaceActive?: boolean;
    server?: boolean;
    alwaysAccept?: boolean;
  }>();
  if (opts.server) {
    printerr(color.warn('run: --server: Phase 4 not landed yet; use --no-server'));
    return 2;
  }
  const goal = cmd.args.join(' ').trim();
  if (!goal) {
    printerr('run: missing <goal>');
    return 2;
  }
  const cwd = process.cwd();
  println(color.dim(`run: goal = ${goal}`));
  const active = activeRunId(cwd);
  if (active) {
    if (opts.replaceActive) {
      abortRun(active);
      println(color.warn(`run: aborted previous active run ${active}`));
    } else {
      printerr(
        color.error(
          `run: run already in progress (id=${active}); use 'beaver resume ${active}' or 'beaver abort ${active}'`,
        ),
      );
      return 1;
    }
  }
  const beaver = new Beaver({
    rootPath: cwd,
    autoApproveFinalReview: opts.autoApproveFinalReview === true,
    alwaysAccept: opts.alwaysAccept === true,
    onAgentEvent: (() => {
      let lastText = '';
      return (event: AgentEvent) => {
        const text = agentText(event);
        if (!text || text === lastText) return;
        lastText = text;
        println('');
        println(color.dim('agent:'));
        println(text);
      };
    })(),
  });
  try {
    println(color.dim('run: planning and dispatching agent...'));
    if (opts.autoApproveFinalReview) {
      println(color.dim('run: final review will be auto-approved for launcher mode'));
    }
    // v0.1.1-C — Tauri shell sets BEAVER_PARENT_RUN_ID when the user
    // clicks "Continue run" on a finished run. Threading it through
    // here lets the refiner/planner produce incremental edits.
    const parentRunId = process.env['BEAVER_PARENT_RUN_ID'];
    const result = await beaver.run({
      goal,
      ...(parentRunId !== undefined && parentRunId.length > 0 ? { parentRunId } : {}),
    });
    println(color.dim(`run: provider = ${result.provider}`));
    println(color.success(`run: ${result.runId} → ${result.finalState}`));
    return result.finalState === 'COMPLETED' ? 0 : 1;
  } catch (e) {
    printerr(color.error(`run: ${(e as Error).message}`));
    return 1;
  }
}
