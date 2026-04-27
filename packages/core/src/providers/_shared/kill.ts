// Graceful child-process termination for the Claude Code adapter.
//
// Sends SIGTERM, waits up to `escalateAfterMs`, then sends SIGKILL.
// Resolves once the child has actually exited (or after a hard upper
// bound to avoid hanging the orchestrator on a misbehaving CLI).

import type { ChildProcess } from 'node:child_process';

const DEFAULT_ESCALATE_MS = 2_000;
const DEFAULT_HARD_DEADLINE_MS = 5_000;

export interface KillOptions {
  /** ms to wait between SIGTERM and SIGKILL. Defaults to 2_000. */
  escalateAfterMs?: number;
  /** Absolute upper bound. Defaults to 5_000. */
  hardDeadlineMs?: number;
}

export async function killGracefully(child: ChildProcess, opts: KillOptions = {}): Promise<void> {
  const escalateAfter = opts.escalateAfterMs ?? DEFAULT_ESCALATE_MS;
  const hardDeadline = opts.hardDeadlineMs ?? DEFAULT_HARD_DEADLINE_MS;

  if (child.exitCode !== null || child.signalCode !== null) return;

  return await new Promise<void>((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(escalateTimer);
      clearTimeout(hardTimer);
      resolve();
    };

    child.once('exit', finish);

    try {
      child.kill('SIGTERM');
    } catch {
      // Already gone — let the exit event fire naturally.
    }

    const escalateTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore — escalation best-effort.
        }
      }
    }, escalateAfter);

    const hardTimer = setTimeout(finish, hardDeadline);
  });
}
