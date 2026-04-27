// PreToolUse hook core. Importable function so 100-call latency tests
// can run in-process; the executable wrapper (hook.ts) reads stdin/env
// and exits with the returned code.
//
// Per P1.S3 spaghetti rule: this file imports ONLY from
// core/sandbox/classify and core/workspace/* — no transitive pulls into
// other provider code.

import { z } from 'zod';

import { buildClassifyEvent, classify } from '../../sandbox/classify.js';
import { insertCheckpoint, getCheckpoint } from '../../workspace/dao/checkpoints.js';
import { insertEvent } from '../../workspace/dao/events.js';
import { closeDb, openDb } from '../../workspace/db.js';

export const ALLOW_EXIT = 0 as const;
export const DENY_EXIT = 2 as const;

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_POLL_TIMEOUT_MS = 60 * 60 * 1000;

export const HookInputSchema = z.object({
  tool: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
});
export type HookInput = z.infer<typeof HookInputSchema>;

export interface HookEnv {
  dbPath: string;
  runId: string;
  worktree: string;
  cwd: string;
}

export interface HookResult {
  exitCode: 0 | 2;
  stderr?: string;
  checkpointId?: string;
}

export interface RunHookOptions {
  input: HookInput;
  env: HookEnv;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  idGen?: () => string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const defaultNow = (): number => Date.now();
const defaultIdGen = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function extractCmd(input: HookInput): string {
  if (input.tool === 'shell' && typeof input.input.command === 'string') {
    return input.input.command;
  }
  return JSON.stringify(input.input);
}

export async function runHook(opts: RunHookOptions): Promise<HookResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? defaultNow;
  const idGen = opts.idGen ?? defaultIdGen;
  const pollInterval = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollTimeout = opts.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  const cmd = extractCmd(opts.input);
  const verdict = classify(cmd, opts.env.cwd, opts.env.worktree);
  const eventPayload = buildClassifyEvent(cmd, opts.env.cwd, opts.env.worktree, verdict);

  let db;
  try {
    db = openDb({ path: opts.env.dbPath });
  } catch (e) {
    return { exitCode: DENY_EXIT, stderr: `hook: cannot open db: ${(e as Error).message}` };
  }

  try {
    insertEvent(db, {
      run_id: opts.env.runId,
      ts: new Date(now()).toISOString(),
      source: 'sandbox-hook',
      type: verdict.verdict === 'hard-deny' ? 'agent.shell.denied' : 'agent.shell.classify',
      payload_json: JSON.stringify(eventPayload),
    });

    if (verdict.verdict === 'hard-deny') {
      return { exitCode: DENY_EXIT, stderr: `hook: hard-deny: ${verdict.reason}` };
    }
    if (verdict.verdict === 'allow') {
      return { exitCode: ALLOW_EXIT };
    }

    // require-confirmation: write checkpoint + poll until answered.
    const checkpointId = `cp-${opts.env.runId}-${idGen()}`;
    insertCheckpoint(db, {
      id: checkpointId,
      run_id: opts.env.runId,
      kind: 'risky-change-confirmation',
      status: 'pending',
      prompt: `${verdict.reason}\n\ncmd: ${cmd}`,
    });

    const start = now();
    while (now() - start < pollTimeout) {
      await sleep(pollInterval);
      const cp = getCheckpoint(db, checkpointId);
      if (!cp) continue;
      if (cp.status === 'answered') {
        const approved = cp.response === 'approve';
        return {
          exitCode: approved ? ALLOW_EXIT : DENY_EXIT,
          checkpointId,
          ...(approved ? {} : { stderr: `hook: rejected: ${cp.response ?? 'no reason'}` }),
        };
      }
      if (cp.status === 'cancelled' || cp.status === 'timed_out') {
        return {
          exitCode: DENY_EXIT,
          stderr: `hook: checkpoint ${cp.status}`,
          checkpointId,
        };
      }
    }
    return { exitCode: DENY_EXIT, stderr: 'hook: checkpoint timed out', checkpointId };
  } catch (e) {
    return { exitCode: DENY_EXIT, stderr: `hook: error: ${(e as Error).message}` };
  } finally {
    try {
      closeDb(db);
    } catch {
      // ignore close failure
    }
  }
}
