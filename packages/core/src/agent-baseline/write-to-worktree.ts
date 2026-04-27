// Write the rendered baseline into a worktree under whichever convention
// file name(s) the spawning provider auto-discovers. See
// docs/models/agent-baseline.md "Convention file naming (per-provider)".
//
//   claude-code -> CLAUDE.md
//   codex       -> AGENTS.md
//   anything else -> both (defensive default; e.g. unknown future provider)
//
// Caller must ensure no user-owned file is being shadowed (the doc's
// "physical file rule"). This function unconditionally overwrites — by
// contract it runs against an agent-owned worktree path.

import fs from 'node:fs';
import path from 'node:path';

import type { AgentBaselineProvider } from './render.js';

export interface WriteBaselineOpts {
  worktreePath: string;
  provider: AgentBaselineProvider | (string & {});
  content: string;
}

export interface WriteBaselineResult {
  written: string[];
}

export function writeBaselineToWorktree(opts: WriteBaselineOpts): WriteBaselineResult {
  fs.mkdirSync(opts.worktreePath, { recursive: true });

  const targets: string[] =
    opts.provider === 'claude-code'
      ? ['CLAUDE.md']
      : opts.provider === 'codex'
        ? ['AGENTS.md']
        : ['CLAUDE.md', 'AGENTS.md'];

  const written: string[] = [];
  for (const name of targets) {
    const dest = path.join(opts.worktreePath, name);
    fs.writeFileSync(dest, opts.content, 'utf8');
    written.push(dest);
  }
  return { written };
}
