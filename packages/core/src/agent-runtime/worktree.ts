// Git worktree management for agent runs.
//
// Each agent gets an isolated worktree on a per-(runId, agentId) branch so
// concurrent agents never see each other's edits. Branch name format is
// `beaver/<runId>/<agentId>` per docs/architecture/agent-runtime.md.
//
// Pure plumbing: shells out to `git worktree add` / `git worktree remove`
// and `git branch -D` for cleanup. No state — callers track the returned
// `{ path, branch }` themselves (typically in the `agents` table).

import { spawn } from 'node:child_process';

export interface CreateWorktreeOptions {
  /** Repo root that owns the worktree (must be a git repo). */
  repoRoot: string;
  /** Run id; combined with agentId to form the branch name. */
  runId: string;
  /** Agent id; combined with runId to form the branch name. */
  agentId: string;
  /** Absolute path where the worktree will be created. */
  path: string;
  /** Base branch / commit to fork from. Defaults to HEAD. */
  branch?: string;
}

export interface WorktreeHandle {
  path: string;
  branch: string;
}

export interface RemoveWorktreeOptions {
  /** Repo root that owns the worktree. */
  repoRoot: string;
  /** Worktree path returned by createWorktree. */
  path: string;
  /** Branch returned by createWorktree; deleted after worktree removal. */
  branch: string;
}

export function branchName(runId: string, agentId: string): string {
  return `beaver/${runId}/${agentId}`;
}

export async function createWorktree(opts: CreateWorktreeOptions): Promise<WorktreeHandle> {
  const branch = branchName(opts.runId, opts.agentId);
  const base = opts.branch ?? 'HEAD';
  await runGit(opts.repoRoot, ['worktree', 'add', '-b', branch, opts.path, base]);
  return { path: opts.path, branch };
}

export async function removeWorktree(opts: RemoveWorktreeOptions): Promise<void> {
  // --force handles a dirty worktree (uncommitted edits from a killed agent).
  await runGit(opts.repoRoot, ['worktree', 'remove', '--force', opts.path]);
  // Best-effort branch delete; a missing branch (already pruned) is fine.
  await runGit(opts.repoRoot, ['branch', '-D', opts.branch], { allowFailure: true });
}

interface RunGitOptions {
  allowFailure?: boolean;
}

function runGit(cwd: string, args: string[], opts: RunGitOptions = {}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stderrChunks: Buffer[] = [];
    child.stderr?.on('data', (c: Buffer) => stderrChunks.push(c));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || opts.allowFailure) {
        resolve();
        return;
      }
      const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
      reject(new Error(`git ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });
}
