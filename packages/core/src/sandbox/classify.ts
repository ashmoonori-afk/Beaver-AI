// Sandbox policy classifier per docs/models/sandbox-policy.md.
//
// Pure function: classify(cmd, cwd, worktreePath) -> Verdict + reason.
// The function performs no I/O, no Date.now, no env reads — every input is
// supplied by the caller. Order of evaluation:
//
//   1. defensive default: empty / whitespace cmd is hard-deny.
//   2. regex pattern table from patterns.ts: first hit wins. Literal cases
//      like `rm -rf /` and `git push` are caught here.
//   3. peel a leading `cd <dir> && ` to compute the effective cwd, then run
//      the path-aware rm-rf check (catches `cd / && rm -rf .` and similar
//      after resolution).
//   4. path-aware "write outside worktree" for known write commands:
//      -> require-confirmation.
//   5. default: allow.

import { effectiveCwd, isInsideOrEqual, isSystemRoot, resolveAgainst } from './paths.js';
import { PATTERNS, type Verdict } from './patterns.js';

export interface ClassifyResult {
  readonly verdict: Verdict;
  readonly reason: string;
  readonly patternId?: string;
}

export interface ClassifyEvent {
  readonly type: 'agent.shell.classify';
  readonly cmd: string;
  readonly cwd: string;
  readonly worktree: string;
  readonly verdict: Verdict;
  readonly reason: string;
  readonly patternId?: string;
}

const WRITE_COMMAND = /^\s*(mkdir|rmdir|rm|mv|cp|touch|ln|chmod|chown)\s+(?:-\S+\s+)*(\S+)/;
const RM_RF_TARGET = /\brm\s+-[rRf]+\s+(\S+)/;

export function classify(cmd: string, cwd: string, worktreePath: string): ClassifyResult {
  if (!cmd.trim()) {
    return { verdict: 'hard-deny', reason: 'empty command' };
  }

  // Regex table first — literal patterns from the doc table win, with their
  // documented patternId. This keeps `rm -rf /` reported as `rm-rf-system`
  // (the named pattern), not the resolved-target fallback.
  for (const p of PATTERNS) {
    if (p.regex.test(cmd)) {
      return { verdict: p.verdict, reason: p.reason, patternId: p.id };
    }
  }

  // Path-aware rm-rf check after the regex table. Catches forms the regex
  // can't see — e.g. `cd / && rm -rf .` resolves to `rm -rf /` only after
  // the cd is peeled and the relative target is joined to the new cwd.
  const { cwd: effCwd, rest } = effectiveCwd(cmd, cwd);
  const rmTarget = RM_RF_TARGET.exec(rest)?.[1];
  if (rmTarget) {
    const abs = resolveAgainst(rmTarget, effCwd);
    if (isSystemRoot(rmTarget) || isSystemRoot(abs)) {
      return {
        verdict: 'hard-deny',
        reason: 'system-level destruction (resolved target)',
        patternId: 'rm-rf-system-resolved',
      };
    }
  }

  // Path-aware "write outside worktree" — only fires when the command matches
  // a write-verb head and the target resolves outside the agent's worktree.
  const wm = WRITE_COMMAND.exec(rest);
  if (wm?.[2]) {
    const target = wm[2];
    const abs = resolveAgainst(target, effCwd);
    if (!isInsideOrEqual(abs, worktreePath)) {
      return {
        verdict: 'require-confirmation',
        reason: 'write to path outside worktree',
        patternId: 'write-outside-worktree',
      };
    }
  }

  return { verdict: 'allow', reason: 'no rule matched' };
}

export function buildClassifyEvent(
  cmd: string,
  cwd: string,
  worktreePath: string,
  result: ClassifyResult,
): ClassifyEvent {
  const event: ClassifyEvent = {
    type: 'agent.shell.classify',
    cmd,
    cwd,
    worktree: worktreePath,
    verdict: result.verdict,
    reason: result.reason,
    ...(result.patternId !== undefined && { patternId: result.patternId }),
  };
  return event;
}
