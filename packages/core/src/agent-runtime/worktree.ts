// Git worktree management for agent runs.
//
// Each agent gets an isolated worktree on a per-(runId, agentId) branch so
// concurrent agents never see each other's edits. Branch name format is
// `beaver/<runId>/<agentId>` per docs/architecture/agent-runtime.md.
//
// Pure plumbing: shells out to `git worktree add` / `git worktree remove`
// and `git branch -D` for cleanup. No state — callers track the returned
// `{ path, branch }` themselves (typically in the `agents` table).
//
// Phase 2-A also exposes `mergeBranchInto` so the orchestrator's
// INTEGRATING phase can fold per-task branches into the user's working
// branch sequentially, with conflicts surfaced as a structured error
// rather than a raw exit code.

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

// --- Phase 2-A — branch merge for INTEGRATING -----------------------------

export interface MergeBranchInput {
  /** Repo root (the user's project root, NOT a per-task worktree). */
  repoRoot: string;
  /** Branch to merge into HEAD. */
  branch: string;
  /** Commit message override (default: "beaver: integrate <branch>"). */
  message?: string;
}

export type MergeBranchResult =
  | { ok: true; alreadyUpToDate: boolean }
  | { ok: false; conflictedFiles: readonly string[] };

/** Merge `branch` into the current HEAD of `repoRoot`. Returns a
 *  structured success/conflict result instead of throwing on the
 *  conflict path so the orchestrator can post a checkpoint and let
 *  the user decide.
 *
 *  Real OS errors (git missing, repo corrupt) still throw. */
export async function mergeBranchInto(input: MergeBranchInput): Promise<MergeBranchResult> {
  const message = input.message ?? `beaver: integrate ${input.branch}`;
  const code = await runGitExitCode(input.repoRoot, [
    'merge',
    '--no-ff',
    '--no-edit',
    '-m',
    message,
    input.branch,
  ]);
  if (code === 0) {
    return { ok: true, alreadyUpToDate: false };
  }
  // Git returns 0 for already-up-to-date too, so a non-zero exit is
  // either a conflict or a real error. Probe for conflict markers.
  const conflicted = await listConflictedFiles(input.repoRoot);
  if (conflicted.length > 0) {
    return { ok: false, conflictedFiles: conflicted };
  }
  // No conflicts but merge failed — bubble up so the caller sees the
  // real reason. Re-run with a real runGit to capture stderr.
  await runGit(input.repoRoot, ['merge', '--no-ff', '--no-edit', '-m', message, input.branch]);
  // Unreachable: previous line throws when merge fails.
  return { ok: true, alreadyUpToDate: true };
}

/** Abort an in-progress merge (used after we hand off to a checkpoint
 *  and the user rejects). Best-effort — a no-op when no merge is
 *  in progress. */
export async function abortMerge(repoRoot: string): Promise<void> {
  await runGit(repoRoot, ['merge', '--abort'], { allowFailure: true });
}

function runGitExitCode(cwd: string, args: string[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? -1));
  });
}

function runGitCapture(cwd: string, args: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    child.stdout?.on('data', (c: Buffer) => stdout.push(c));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8'));
        return;
      }
      reject(new Error(`git ${args.join(' ')} exited ${code}`));
    });
  });
}

async function listConflictedFiles(repoRoot: string): Promise<readonly string[]> {
  // `git diff --name-only --diff-filter=U` lists files with unmerged
  // entries (i.e. files in conflict). One per line.
  try {
    const out = await runGitCapture(repoRoot, ['diff', '--name-only', '--diff-filter=U']);
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch {
    return [];
  }
}
