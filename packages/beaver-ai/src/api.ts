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
  CodexAdapter,
  PlanSchema,
  answerCheckpoint,
  closeDb,
  insertEvent,
  insertProject,
  insertRate,
  insertRun,
  listEventsByRun,
  listPendingCheckpoints,
  openDb,
  runMigrations,
  runOrchestrator,
  type AgentEvent,
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
  /** Custom Codex adapter for frontend/UI work. */
  codexAdapter?: ProviderAdapter;
  /** Override the SQLite path (default: <rootPath>/.beaver/beaver.db). */
  dbPath?: string;
  /** Auto-answer the final-review checkpoint with 'approve'. Default true
   *  for the library convenience API; CLI sets false and prompts the user. */
  autoApproveFinalReview?: boolean;
  /** Stream raw agent events to callers such as the CLI. */
  onAgentEvent?: (event: AgentEvent) => void;
}

export interface RunRequest {
  goal: string;
  /** Optional pre-built plan; if omitted a single-task stub plan is used. */
  plan?: Plan;
}

export interface RunOutcome {
  runId: string;
  finalState: RunState;
  provider: 'claude-code' | 'codex';
  /** Set when this run was a fallback retry; points to the original FAILED run id. */
  fallbackFrom?: string;
}

/** Patterns indicating the CLI rejected the run for a reason that another
 *  CLI (the fallback provider) would not share — usage/rate caps, auth, quota.
 *  Errors that are likely deterministic (bad prompt, syntax) are NOT in here. */
const FALLBACK_TRIGGER_PATTERNS = [
  /usage limit/i,
  /rate[- ]?limit/i,
  /quota/i,
  /you have hit/i,
  /you've hit/i,
  /429/,
  /upgrade to pro/i,
  /credits/i,
];

function isFallbackTrigger(text: string): boolean {
  return FALLBACK_TRIGGER_PATTERNS.some((re) => re.test(text));
}

const FRONTEND_TERMS = [
  'frontend',
  'front-end',
  'ui',
  'ux',
  'web',
  'html',
  'css',
  'react',
  'vite',
  'next',
  'tailwind',
  'component',
  'page',
  'landing',
  '프론트',
  '웹',
  '화면',
  '페이지',
  '디자인',
  '컴포넌트',
  '랜딩',
] as const;

const BACKEND_TERMS = [
  'backend',
  'back-end',
  'api',
  'server',
  'database',
  'db',
  'sqlite',
  'postgres',
  'auth',
  'queue',
  'worker',
  '백엔드',
  '서버',
  '데이터베이스',
  '인증',
  '디비',
] as const;

export function providerForGoal(goal: string): 'claude-code' | 'codex' {
  // Env override always wins. Lets the launcher pin a provider when one
  // upstream (e.g. codex usage limit) is unavailable.
  const envOverride = process.env.BEAVER_PROVIDER;
  if (envOverride === 'claude-code' || envOverride === 'codex') return envOverride;

  const normalized = goal.toLowerCase();
  const frontendScore = FRONTEND_TERMS.filter((term) => normalized.includes(term)).length;
  const backendScore = BACKEND_TERMS.filter((term) => normalized.includes(term)).length;
  if (frontendScore > 0 && frontendScore >= backendScore) return 'codex';
  return 'claude-code';
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
    try {
      insertRate(db, {
        provider: 'codex',
        model: 'codex',
        tokens_in_per_usd: 333_333,
        tokens_out_per_usd: 66_666,
        effective_from: '2026-01-01T00:00:00Z',
      });
    } catch {
      // Already seeded.
    }
    closeDb(db);
  }

  /** Run a single goal end-to-end. Returns once the run reaches a terminal state.
   *  If the first provider FAILS for a reason matching a fallback trigger
   *  (usage limit / rate limit / quota / 429), the run is retried with the
   *  other provider exactly once. Set BEAVER_NO_FALLBACK=1 to disable. */
  async run(req: RunRequest): Promise<RunOutcome> {
    this.init();

    const initialProvider = providerForGoal(req.goal);
    const first = await this.runOnce(req, initialProvider);

    if (first.finalState !== 'FAILED') return first;
    if (process.env.BEAVER_NO_FALLBACK === '1') return first;
    if (first.fallbackFrom !== undefined) return first; // already a fallback; do not loop

    const reason = this.detectFailureReason(first.runId);
    if (!isFallbackTrigger(reason)) return first;

    // Retry with the other provider, single attempt.
    const otherProvider: 'claude-code' | 'codex' =
      initialProvider === 'codex' ? 'claude-code' : 'codex';
    this.recordFallback(first.runId, otherProvider, reason);
    const second = await this.runOnce(req, otherProvider);
    return { ...second, fallbackFrom: first.runId };
  }

  private async runOnce(req: RunRequest, provider: 'claude-code' | 'codex'): Promise<RunOutcome> {
    const db = openDb({ path: this.dbPath });
    const runId = `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      this.seedProjectAndRun(db, runId, req.goal);

      const adapter =
        provider === 'codex'
          ? (this.opts.codexAdapter ?? new CodexAdapter({ db, providerForRate: 'codex' }))
          : (this.opts.claudeAdapter ??
            new ClaudeCodeAdapter({ db, providerForRate: 'claude-code' }));

      const plan = req.plan ?? stubPlanFor(req.goal);

      const autoAnswerCancel =
        this.opts.autoApproveFinalReview === false ? null : startAutoApprover(db, runId);

      try {
        const result = await runOrchestrator({
          db,
          runId,
          goal: req.goal,
          plan,
          executor: async () =>
            adapter.run({
              prompt: req.goal,
              workdir: this.rootPath,
              ...(this.opts.onAgentEvent !== undefined && { onEvent: this.opts.onAgentEvent }),
            }),
          pollTimeoutMs: 30_000,
        });
        return { runId, finalState: result.finalState, provider };
      } finally {
        autoAnswerCancel?.();
      }
    } finally {
      closeDb(db);
    }
  }

  /** Pull recent events for the failed run and stitch their text together
   *  so isFallbackTrigger() can match against the full failure surface
   *  (transcript text, FSM-emitted FAIL reasons, lifted CLI error events). */
  private detectFailureReason(runId: string): string {
    const db = openDb({ path: this.dbPath });
    try {
      const events = listEventsByRun(db, runId);
      return events
        .map((e) => e.payload_json ?? '')
        .filter((p) => p.length > 0)
        .join('\n');
    } finally {
      closeDb(db);
    }
  }

  /** Drop a single audit row before the fallback run starts, so anyone
   *  reading the ledger can see the retry was deliberate. */
  private recordFallback(originalRunId: string, nextProvider: string, reason: string): void {
    const db = openDb({ path: this.dbPath });
    try {
      insertEvent(db, {
        run_id: originalRunId,
        ts: new Date().toISOString(),
        source: 'beaver',
        type: 'agent.provider.fallback',
        payload_json: JSON.stringify({
          nextProvider,
          reason: reason.slice(0, 500),
        }),
      });
    } catch {
      // best effort — fallback should run regardless
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
