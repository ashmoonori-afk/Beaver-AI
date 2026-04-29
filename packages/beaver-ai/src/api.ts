// Beaver AI library entry point.
//
// Wires together the orchestrator (P2.S3), agent adapters (P1.S2/S4),
// rate-table-aware budget (P0.S3 + P1.S2), and the SQLite ledger
// (P0.S3) into a single `Beaver` facade. CLI (P3) and web UI (P4)
// drive this same surface — there is no separate code path for
// programmatic vs human invocation.

import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

import {
  ClaudeCodeAdapter,
  CodexAdapter,
  PlanSchema,
  answerCheckpoint,
  closeDb,
  dispatchPrdTasks,
  getRun,
  listPlansByRun,
  insertEvent,
  insertProject,
  insertRate,
  insertRun,
  listEventsByRun,
  listPendingCheckpoints,
  makeLlmPlanner,
  makeLlmRefiner,
  makeLlmReviewer,
  makePrdReviewer,
  openDb,
  runMigrations,
  runOrchestrator,
  wikiQueryFor,
  type AgentEvent,
  type Db,
  type DispatchResult,
  type ParentRunContext,
  type Plan,
  type Planner,
  type ProviderAdapter,
  type Refiner,
  type RunState,
  type Task,
  type WikiQueryFn,
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
  /** Sprint A — auto-answer the plan-approval checkpoint with 'approve'.
   *  When undefined, follows `autoApproveFinalReview` so the CLI/desktop
   *  default (which leaves final-review for the user) also leaves
   *  plan-approval for the user. Set explicitly to override. The env
   *  `BEAVER_AUTO_APPROVE_PLAN=1` always wins. */
  autoApprovePlan?: boolean;
  /** Sprint C — disable wiki-hint prepending on human-decision
   *  checkpoints. When true (or env BEAVER_DISABLE_WIKI_HINTS=1), the
   *  orchestrator skips wikiQuery and posts plain prompts. */
  disableWikiHints?: boolean;
  /** v0.2 M2.6 — when true (or env `BEAVER_ALWAYS_ACCEPT=1`), the
   *  PRD dispatcher omits the reviewer and marks every task done
   *  after one coder call. Restores v0.1 always-accept behaviour for
   *  benchmarking + escape hatch when the reviewer is misbehaving. */
  alwaysAccept?: boolean;
  /** v0.2.2 — when true (or env BEAVER_AUTO_CONFIRM_REFINEMENT=1),
   *  the orchestrator skips the goal-refinement checkpoint when the
   *  refiner returns ready=true. Default: undefined → mirrors
   *  `autoApproveFinalReview` (programmatic Beaver().run() callers
   *  get hands-off; CLI/desktop wait for an explicit user Confirm). */
  autoConfirmReadyRefinement?: boolean;
  /** Stream raw agent events to callers such as the CLI. */
  onAgentEvent?: (event: AgentEvent) => void;
  /** W.12.4 — explicit refiner. When omitted, the env var BEAVER_REFINER
   *  decides: 'llm' wires the LlmRefiner against the project's
   *  ClaudeCodeAdapter; anything else (or absent) skips refinement
   *  entirely (backward compat with v0.0 callers). */
  refiner?: Refiner;
  /** W.12.4 — explicit planner. Same precedence as `refiner`. When
   *  omitted and BEAVER_PLANNER=llm, the LlmPlanner is wired. Without
   *  either, the legacy stubPlanFor(goal) single-task plan is used. */
  planner?: Planner;
}

export interface RunRequest {
  goal: string;
  /** Optional pre-built plan; if omitted a single-task stub plan is used. */
  plan?: Plan;
  /** v0.1.1-C — when set, this run is a follow-up on a previous run.
   *  The runner loads the parent's row + plan from SQLite and threads
   *  it into the refiner/planner so they produce incremental edits
   *  rather than starting over. */
  parentRunId?: string;
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
    // review-pass v0.1: previously `r-${Date.now()}-${random6}` had a
    // collision window under rapid-fire test parallelism that triggers
    // a SQLite PK violation. UUID v4 has 122 bits of entropy.
    const runId = `r-${randomUUID()}`;
    try {
      this.seedProjectAndRun(db, runId, req.goal);

      const adapter =
        provider === 'codex'
          ? (this.opts.codexAdapter ?? new CodexAdapter({ db, providerForRate: 'codex' }))
          : (this.opts.claudeAdapter ??
            new ClaudeCodeAdapter({ db, providerForRate: 'claude-code' }));

      // W.12.4 — resolve refiner + planner from explicit opts > env > none.
      // The orchestrator handles the three states cleanly:
      //   - both set     -> INITIALIZED -> REFINING_GOAL -> PLANNING (PRD-driven)
      //   - planner only -> INITIALIZED -> PLANNING (PRD-less plan synthesis)
      //   - neither      -> INITIALIZED + req.plan ?? stubPlanFor(goal)
      const refiner =
        this.opts.refiner ??
        (process.env['BEAVER_REFINER'] === 'llm' ? makeLlmRefiner({ adapter }) : undefined);
      const planner =
        this.opts.planner ??
        (process.env['BEAVER_PLANNER'] === 'llm' ? makeLlmPlanner({ adapter }) : undefined);
      const plan = planner ? undefined : (req.plan ?? stubPlanFor(req.goal));
      // Phase 1-A — lazy reviewer factory. Built after the plan
      // resolves so the reviewer has acceptance criteria in context.
      // Auto-injected when BEAVER_REVIEWER=llm; opts.reviewer is the
      // explicit override (no factory escape hatch since explicit
      // reviewers don't need plan context).
      const makeReviewer =
        process.env['BEAVER_REVIEWER'] === 'llm'
          ? (resolvedPlan: Plan) => {
              const tasksById = new Map(resolvedPlan.tasks.map((t) => [t.id, t]));
              return makeLlmReviewer({ adapter, tasksById });
            }
          : undefined;

      // Sprint A — plan-approval auto-answer follows the same
      // convenience-vs-interactive split as final-review. When the
      // caller hasn't set `autoApprovePlan` explicitly, mirror
      // `autoApproveFinalReview`: programmatic Beaver().run() callers
      // get hands-off auto-approval; CLI/desktop (which set
      // autoApproveFinalReview=false) leave plan-approval for the user.
      const autoApprovePlan =
        this.opts.autoApprovePlan ?? this.opts.autoApproveFinalReview !== false;
      // v0.2.2 — same split for the goal-refinement auto-confirm
      // gate. CLI/desktop default to interactive (false); the
      // convenience API stays hands-off (true).
      const autoConfirmReadyRefinement =
        this.opts.autoConfirmReadyRefinement ?? this.opts.autoApproveFinalReview !== false;
      const autoAnswerCancel =
        this.opts.autoApproveFinalReview === false
          ? null
          : startAutoApprover(db, runId, { autoApprovePlan });

      // v0.1.1-C: load parent run context if requested. Best-effort —
      // if the row or plan disappeared we still proceed without it.
      const parentContext = req.parentRunId
        ? await loadParentContext(db, req.parentRunId)
        : undefined;

      // Phase 2-A — concurrency lifted from BEAVER_MAX_PARALLEL_TASKS
      // (default 1 = sequential, single-worktree path preserved).
      // Values >1 enable per-task worktrees + sequential INTEGRATING
      // merges into the user's working branch.
      const maxParallelTasks = parseMaxParallelTasks(process.env['BEAVER_MAX_PARALLEL_TASKS']);

      // Sprint C — wiki hint provider. Skipped when the user opted
      // out (option / env), or when no wiki dir exists yet (queryWiki
      // already returns "no info" silently in that case so we still
      // wire it; the env switch is for users who want zero overhead).
      const wikiQuery = this.resolveWikiQuery(adapter);

      // v0.2 M2 — PRD dispatcher closure. The orchestrator only
      // invokes this when a prd_runs row materialises mid-run (i.e.
      // the user passed the M1.5 ConfirmGate). --always-accept
      // (option or env BEAVER_ALWAYS_ACCEPT=1) drops the reviewer.
      const alwaysAccept =
        this.opts.alwaysAccept === true || process.env['BEAVER_ALWAYS_ACCEPT'] === '1';
      const runPrdDispatch = async (
        prdRunId: string,
        repoRoot: string,
      ): Promise<DispatchResult> => {
        const reviewer = alwaysAccept ? undefined : makePrdReviewer({ adapter });
        return dispatchPrdTasks({
          db,
          runId,
          prdRunId,
          repoRoot,
          adapter,
          ...(reviewer !== undefined ? { reviewer } : {}),
        });
      };

      try {
        const result = await runOrchestrator({
          db,
          runId,
          goal: req.goal,
          ...(plan !== undefined ? { plan } : {}),
          ...(refiner !== undefined ? { refiner } : {}),
          ...(planner !== undefined ? { planner } : {}),
          ...(makeReviewer !== undefined ? { makeReviewer } : {}),
          ...(parentContext !== undefined ? { parentContext } : {}),
          // review-pass v0.1: previously this passed `req.goal` raw,
          // ignoring both the refiner's enrichedGoal and the planner's
          // per-task prompt. Use `task.prompt` (the agent-ready prompt
          // the planner crafted from PRD context) so refiner+planner
          // outputs actually drive execution.
          //
          // Phase 2-A: parallel mode passes a per-task `workdir` so
          // each task runs in its own worktree. Sequential mode
          // doesn't pass it; the agent runs in `this.rootPath` as
          // before.
          executor: async (task, opts) =>
            adapter.run({
              prompt: task.prompt,
              workdir: opts?.workdir ?? this.rootPath,
              ...(this.opts.onAgentEvent !== undefined && { onEvent: this.opts.onAgentEvent }),
            }),
          maxParallelTasks,
          repoRoot: this.rootPath,
          autoApprovePlan,
          autoConfirmReadyRefinement,
          ...(wikiQuery !== undefined ? { wikiQuery } : {}),
          runPrdDispatch,
          // Sprint A — bump from 30 s to 30 min so a human reading the
          // plan-approval / final-review prompt has realistic time to
          // respond. Tests inject smaller values explicitly. The
          // refiner already had its own 30-min cap; this brings the
          // other human-decision waits in line.
          pollTimeoutMs: 30 * 60 * 1000,
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

  /** Sprint C — build a wiki-hint closure for the orchestrator. Returns
   *  `undefined` when wiki hints are disabled (option or env) so the
   *  orchestrator's `prependWikiHint` short-circuits without overhead.
   *  Otherwise binds `<rootPath>/.beaver/wiki` + the active adapter. */
  private resolveWikiQuery(adapter: ProviderAdapter): WikiQueryFn | undefined {
    if (this.opts.disableWikiHints === true) return undefined;
    if (process.env['BEAVER_DISABLE_WIKI_HINTS'] === '1') return undefined;
    const wikiRoot = path.join(this.rootPath, DEFAULT_BEAVER_DIR, 'wiki');
    return wikiQueryFor(wikiRoot, adapter);
  }

  private seedProjectAndRun(db: Db, runId: string, goal: string): void {
    // review-pass v0.1: derive projectId from a hash of the absolute
    // path so two clones of the same folder name in different parents
    // don't collide on the project record. 12 hex chars (~48 bits) is
    // plenty for collision avoidance among a single user's projects.
    const pathHash = createHash('sha256').update(this.rootPath).digest('hex').slice(0, 12);
    const projectId = `p-${pathHash}`;
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

interface AutoApproverOptions {
  /** Sprint A — when false, leave plan-approval checkpoints alone so
   *  the user (CLI prompt or desktop UI) can answer them. */
  autoApprovePlan: boolean;
}

function startAutoApprover(db: Db, runId: string, opts: AutoApproverOptions): () => void {
  // review-pass v0.1: previously, ANY DB error stopped the interval
  // permanently — a single SQLITE_BUSY would cause the orchestrator
  // to hang waiting for an auto-approval that would never come. Only
  // shut down on errors that mean the DB itself is unreachable.
  const interval = setInterval(() => {
    try {
      const pending = listPendingCheckpoints(db, runId);
      for (const cp of pending) {
        // Sprint A — plan-approval auto-answer is now opt-in via
        // `opts.autoApprovePlan` (which mirrors autoApproveFinalReview
        // by default). CLI/desktop leave it false so the orchestrator's
        // explicit plan-approval gate waits for a real human answer.
        const isAutoApprovable =
          cp.kind === 'final-review' ||
          cp.kind === 'goal-refinement' ||
          (cp.kind === 'plan-approval' && opts.autoApprovePlan);
        if (isAutoApprovable) {
          try {
            answerCheckpoint(db, cp.id, 'approve');
          } catch (innerErr) {
            // Transient checkpoint-level error — the next tick retries.
            if (isFatalDbError(innerErr)) {
              clearInterval(interval);
              return;
            }
          }
        }
      }
    } catch (err) {
      // List failure — only stop on fatal "DB closed" errors. SQLITE_BUSY
      // and similar transient errors fall through and retry on next tick.
      if (isFatalDbError(err)) {
        clearInterval(interval);
      }
    }
  }, 100);
  return () => clearInterval(interval);
}

/** Cap on parent-plan JSON embedded in the planner/refiner prompt.
 *  Plan files can be tens of KB; embedding verbatim into a prompt
 *  silently eats the LLM's context window and hides truncation from
 *  the user. 8 KB matches MAX_PAGE_CHARS in wiki/query.ts. */
/** Phase 2-A — parse BEAVER_MAX_PARALLEL_TASKS into a sane integer.
 *  Empty / unparseable / non-positive values fall back to 1 (sequential)
 *  so a typo'd env var degrades gracefully rather than throwing. The
 *  upper bound (16) avoids fork-bombing the host on huge plans. */
function parseMaxParallelTasks(raw: string | undefined): number {
  if (!raw) return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(16, n);
}

const MAX_PARENT_PLAN_JSON_BYTES = 8 * 1024;

/** v0.1.1-C — load parent run context from SQLite for follow-up runs.
 *  Returns undefined when the parent doesn't exist (logged but
 *  non-fatal — the run continues as a normal first-time goal).
 *  v0.1.1 review-pass: async readFile + size cap. */
async function loadParentContext(
  db: Db,
  parentRunId: string,
): Promise<ParentRunContext | undefined> {
  const row = getRun(db, parentRunId);
  if (!row) return undefined;
  // listPlansByRun returns version ASC; take the last entry as the
  // most recent revision of the parent run's plan.
  const plans = listPlansByRun(db, parentRunId);
  const latest = plans[plans.length - 1];
  let planJson: string | null = null;
  if (latest) {
    try {
      const buf = await fs.promises.readFile(latest.content_path, 'utf8');
      planJson =
        buf.length > MAX_PARENT_PLAN_JSON_BYTES
          ? `${buf.slice(0, MAX_PARENT_PLAN_JSON_BYTES)}\n…[truncated; full plan was ${buf.length} bytes]`
          : buf;
    } catch {
      // missing / unreadable / disappeared — fall through to null
    }
  }
  return {
    runId: row.id,
    goal: row.goal,
    finalState: row.status,
    planJson,
  };
}

/** True when the error indicates the DB handle is unrecoverable
 *  (closed / file disappeared). Transient errors like SQLITE_BUSY,
 *  SQLITE_LOCKED return false so the auto-approver keeps polling. */
function isFatalDbError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes('database is closed') ||
    msg.includes('SQLITE_MISUSE') ||
    msg.includes('SQLITE_NOTADB') ||
    msg.includes('unable to open database')
  );
}
