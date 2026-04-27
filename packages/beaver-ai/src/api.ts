// Beaver AI library entry point.
//
// Wires together the orchestrator (P2.S3), agent adapters (P1.S2/S4),
// rate-table-aware budget (P0.S3 + P1.S2), and the SQLite ledger
// (P0.S3) into a single `Beaver` facade. CLI (P3) and web UI (P4)
// drive this same surface — there is no separate code path for
// programmatic vs human invocation.

import path from 'node:path';
import fs from 'node:fs';

import {
  ClaudeCodeAdapter,
  PlanSchema,
  answerCheckpoint,
  closeDb,
  insertProject,
  insertRate,
  insertRun,
  listPendingCheckpoints,
  openDb,
  runMigrations,
  runOrchestrator,
  type Db,
  type Plan,
  type ProviderAdapter,
  type RunState,
  type Task,
} from '@beaver-ai/core';

const DEFAULT_BEAVER_DIR = '.beaver';

export interface BeaverOptions {
  /** Project root (a git repo). Defaults to process.cwd(). */
  rootPath?: string;
  /** Custom Claude adapter — tests/fixtures inject a mock-cli driven adapter. */
  claudeAdapter?: ProviderAdapter;
  /** Override the SQLite path (default: <rootPath>/.beaver/beaver.db). */
  dbPath?: string;
  /** Auto-answer the final-review checkpoint with 'approve'. Default true
   *  for the library convenience API; CLI sets false and prompts the user. */
  autoApproveFinalReview?: boolean;
}

export interface RunRequest {
  goal: string;
  /** Optional pre-built plan; if omitted a single-task stub plan is used. */
  plan?: Plan;
}

export interface RunOutcome {
  runId: string;
  finalState: RunState;
}

function stubPlanFor(goal: string): Plan {
  const candidate = {
    version: 1,
    goal,
    tasks: [
      {
        id: 't1',
        role: 'coder' as const,
        goal: goal.slice(0, 80),
        prompt: goal,
        dependsOn: [] as string[],
        acceptanceCriteria: ['the goal text is satisfied'],
        capabilitiesNeeded: [] as string[],
      } satisfies Task,
    ],
    createdAt: new Date().toISOString(),
  };
  return PlanSchema.parse(candidate);
}

export class Beaver {
  private readonly rootPath: string;
  private readonly dbPath: string;

  constructor(private readonly opts: BeaverOptions = {}) {
    this.rootPath = opts.rootPath ?? process.cwd();
    this.dbPath = opts.dbPath ?? path.join(this.rootPath, DEFAULT_BEAVER_DIR, 'beaver.db');
  }

  /** Initialize .beaver/ + sqlite + seed default rate table. Idempotent. */
  init(): void {
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    const db = openDb({ path: this.dbPath });
    runMigrations(db);
    try {
      insertRate(db, {
        provider: 'claude-code',
        model: 'claude-sonnet-4-6',
        tokens_in_per_usd: 333_333,
        tokens_out_per_usd: 66_666,
        effective_from: '2026-01-01T00:00:00Z',
      });
    } catch {
      // Already seeded — PK violation is fine.
    }
    closeDb(db);
  }

  /** Run a single goal end-to-end. Returns once the run reaches a terminal state. */
  async run(req: RunRequest): Promise<RunOutcome> {
    this.init();
    const db = openDb({ path: this.dbPath });
    const runId = `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      this.seedProjectAndRun(db, runId, req.goal);

      const adapter =
        this.opts.claudeAdapter ?? new ClaudeCodeAdapter({ db, providerForRate: 'claude-code' });

      const plan = req.plan ?? stubPlanFor(req.goal);

      // Auto-approve final-review for the library convenience API. CLI sets
      // autoApproveFinalReview:false so the human answers via `beaver answer`.
      const autoAnswerCancel =
        this.opts.autoApproveFinalReview === false ? null : startAutoApprover(db, runId);

      try {
        const result = await runOrchestrator({
          db,
          runId,
          goal: req.goal,
          plan,
          executor: async () => adapter.run({ prompt: req.goal, workdir: this.rootPath }),
          pollTimeoutMs: 30_000,
        });
        return { runId, finalState: result.finalState };
      } finally {
        autoAnswerCancel?.();
      }
    } finally {
      closeDb(db);
    }
  }

  private seedProjectAndRun(db: Db, runId: string, goal: string): void {
    const projectId = `p-${path.basename(this.rootPath)}`;
    try {
      insertProject(db, {
        id: projectId,
        name: path.basename(this.rootPath),
        root_path: this.rootPath,
        created_at: new Date().toISOString(),
      });
    } catch {
      // existing — ignore
    }
    insertRun(db, {
      id: runId,
      project_id: projectId,
      goal,
      status: 'RUNNING',
      started_at: new Date().toISOString(),
      budget_usd: 20,
    });
  }
}

function startAutoApprover(db: Db, runId: string): () => void {
  const interval = setInterval(() => {
    try {
      const pending = listPendingCheckpoints(db, runId);
      for (const cp of pending) {
        if (cp.kind === 'final-review' || cp.kind === 'plan-approval') {
          answerCheckpoint(db, cp.id, 'approve');
        }
      }
    } catch {
      // db closed or transient — stop trying
      clearInterval(interval);
    }
  }, 100);
  return () => clearInterval(interval);
}
