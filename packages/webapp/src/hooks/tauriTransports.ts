// Tauri-backed transport implementations.
//
// W.12.6 — all 6 transports invoke real Tauri commands. The Rust
// side reads/writes .beaver/beaver.db directly (no NDJSON streaming);
// the renderer polls every POLL_MS for fresh state. Polling is fine
// for v0.1 — the UI is single-user, single-run.
//
// review-pass v0.1: extracted `makePollingLoop` helper so each
// transport's subscribe() is a thin mapper around a single, tested
// cancellation contract. Removed the dead RunSnapshot `stop = false`
// branch. `created_at` now flows from SQLite into renderer-visible
// timestamps so the UI's "X seconds ago" display doesn't reset to 0
// on every poll. `wikiWarned` lives in the factory closure so HMR
// and tests can't stale-mock it.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
  CheckpointKind,
  CheckpointSummary,
  FinalReportSummary,
  LogEvent,
  LogEventLevel,
  PlanSummary,
  PlanTask,
  RunSnapshot,
  RunState,
} from '../types.js';
import type { AskWikiTransport } from './useAskWiki.js';
import type { CheckpointTransport } from './useCheckpoints.js';
import type { EventsTransport } from './useEvents.js';
import type { FinalReviewTransport } from './useFinalReview.js';
import type { PlanListTransport } from './usePlanList.js';
import type { RunSnapshotTransport } from './useRunSnapshot.js';

interface RunStartResult {
  runId: string;
}

const POLL_MS = 1500;

/** Run a polling loop until the returned cleanup is invoked. The
 *  callback is awaited; errors inside it are caught and logged so
 *  one transient backend failure can't kill the whole loop. */
function makePollingLoop(label: string, body: () => Promise<void>): () => void {
  let cancelled = false;
  const tick = async (): Promise<void> => {
    if (cancelled) return;
    try {
      await body();
    } catch (err: unknown) {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.error(`[beaver/tauri] ${label} failed`, err);
    }
    if (!cancelled) setTimeout(tick, POLL_MS);
  };
  void tick();
  return () => {
    cancelled = true;
  };
}

/** Triggered by the GoalBox path. The Tauri shell spawns the CLI
 *  sidecar with the supplied goal and returns a fresh run id. */
export async function tauriStartRun(goal: string): Promise<RunStartResult> {
  // Rust returns snake_case keys; renderer uses camelCase RunStartResult.
  const raw = await invoke<{ run_id: string }>('runs_start', { args: { goal } });
  return { runId: raw.run_id };
}

interface RunRowRaw {
  id: string;
  project_id: string;
  goal: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  budget_usd: number;
  spent_usd: number;
}

function statusToRunState(status: string): RunState {
  // The CLI writes runs.status from the orchestrator FSM; pass through.
  const known: ReadonlySet<string> = new Set([
    'INITIALIZED',
    'REFINING_GOAL',
    'PLANNING',
    'EXECUTING',
    'REVIEWING',
    'FINAL_REVIEW_PENDING',
    'COMPLETED',
    'FAILED',
    'ABORTED',
  ]);
  return known.has(status) ? (status as RunState) : 'INITIALIZED';
}

function runRowToSnapshot(row: RunRowRaw): RunSnapshot {
  return {
    runId: row.id,
    state: statusToRunState(row.status),
    startedAt: row.started_at,
    ...(row.ended_at !== null ? { endedAt: row.ended_at } : {}),
    spentUsd: row.spent_usd,
    budgetUsd: row.budget_usd,
    agents: [],
    openCheckpoints: 0,
  };
}

/** Polling-based RunSnapshot transport. */
export function makeTauriRunSnapshotTransport(): RunSnapshotTransport {
  return {
    subscribe(runId, onSnapshot) {
      let consumerCancelled = false;
      const stopPoll = makePollingLoop(`runs_get(${runId})`, async () => {
        const row = await invoke<RunRowRaw | null>('runs_get', {
          args: { run_id: runId },
        });
        if (!consumerCancelled && row) onSnapshot(runRowToSnapshot(row));
      });
      // Optional event-bus fallback for any future producer that
      // emits `run.snapshot.<runId>`. Failure is silent — polling is
      // primary. The dev console gets the rejection so we can spot
      // genuine IPC bind issues during development.
      let unlisten: (() => void) | null = null;
      listen<RunSnapshot>(`run.snapshot.${runId}`, (e) => {
        if (!consumerCancelled) onSnapshot(e.payload);
      })
        .then((u) => {
          if (consumerCancelled) {
            try {
              u();
            } catch {
              /* tear-down race; nothing to do */
            }
            return;
          }
          unlisten = u;
        })
        .catch((err: unknown) => {
          if (process.env['NODE_ENV'] !== 'production') {
            // eslint-disable-next-line no-console
            console.debug(`[beaver/tauri] listen(run.snapshot.${runId}) skipped`, err);
          }
        });
      return () => {
        consumerCancelled = true;
        stopPoll();
        if (unlisten)
          try {
            unlisten();
          } catch {
            /* ignore */
          }
      };
    },
  };
}

// --- checkpoints ------------------------------------------------------

interface CheckpointRowRaw {
  id: string;
  run_id: string;
  kind: string;
  status: string;
  prompt: string;
  response: string | null;
  /** Server-side ISO timestamp from the orchestrator. May be null
   *  while the v0.1 schema lacks the column; renderer falls back to
   *  the per-row id-based ordering when absent. */
  created_at: string | null;
}

const CHECKPOINT_KINDS: ReadonlySet<CheckpointKind> = new Set([
  'goal-clarification',
  'goal-refinement',
  'plan-approval',
  'risky-change-confirmation',
  'merge-conflict',
  'escalation',
  'final-review',
  'budget-exceeded',
] as const);

function asCheckpointKind(s: string): CheckpointKind {
  return CHECKPOINT_KINDS.has(s as CheckpointKind) ? (s as CheckpointKind) : 'escalation';
}

function rowToCheckpoint(row: CheckpointRowRaw): CheckpointSummary {
  const kind = asCheckpointKind(row.kind);
  const summary: CheckpointSummary = {
    id: row.id,
    runId: row.run_id,
    kind,
    prompt: row.prompt,
    // review-pass v0.1: prefer server-side timestamp; fall back to a
    // stable epoch (id-based) for the legacy schema rather than
    // resetting to "now" every poll. The UI shows the formatted form
    // so a missing timestamp falls through to "—" rather than 0s.
    postedAt: row.created_at ?? new Date(0).toISOString(),
  };
  // For goal-refinement, the orchestrator JSON-encodes the structured
  // payload into `prompt`. Best-effort decode so the UI surfaces the
  // structured PRD/MVP card; on parse failure the raw prompt renders.
  if (kind === 'goal-refinement') {
    try {
      const parsed = JSON.parse(row.prompt) as {
        rawGoal?: string;
        refinement?: CheckpointSummary['refinement'];
      };
      if (parsed?.refinement) summary.refinement = parsed.refinement;
    } catch {
      // leave prompt as-is for the body's fallback rendering
    }
  }
  return summary;
}

export function makeTauriCheckpointTransport(): CheckpointTransport {
  return {
    subscribe(runId, onList) {
      return makePollingLoop(`checkpoints_list(${runId})`, async () => {
        const rows = await invoke<CheckpointRowRaw[]>('checkpoints_list', {
          args: { run_id: runId },
        });
        onList(rows.map(rowToCheckpoint));
      });
    },
    async answer(id, response) {
      await invoke('checkpoints_answer', { args: { id, response } });
    },
  };
}

// --- events -----------------------------------------------------------

interface EventRowRaw {
  id: number;
  run_id: string;
  ts: string;
  source: string;
  kind: string;
  payload_json: string | null;
}

function rowToLogEvent(row: EventRowRaw): LogEvent {
  // Lift level from the payload when present; default 'info'.
  let level: LogEventLevel = 'info';
  let message = row.kind;
  if (row.payload_json) {
    try {
      const payload = JSON.parse(row.payload_json) as {
        level?: LogEventLevel;
        message?: string;
        text?: string;
      };
      if (payload.level && ['info', 'warn', 'error', 'debug'].includes(payload.level)) {
        level = payload.level;
      }
      message = payload.message ?? payload.text ?? row.kind;
    } catch {
      // Keep default; the kind itself is informative enough.
    }
  }
  return {
    id: String(row.id),
    runId: row.run_id,
    ts: row.ts,
    level,
    source: row.source,
    message,
    ...(row.payload_json !== null ? { raw: row.payload_json } : {}),
  };
}

export function makeTauriEventsTransport(): EventsTransport {
  return {
    subscribe(runId, onEvent) {
      let since = -1;
      return makePollingLoop(`events_list(${runId})`, async () => {
        const rows = await invoke<EventRowRaw[]>('events_list', {
          args: { run_id: runId, since },
        });
        for (const row of rows) {
          onEvent(rowToLogEvent(row));
          if (row.id > since) since = row.id;
        }
      });
    },
  };
}

// --- plans ------------------------------------------------------------

interface PlanRowRaw {
  id: string;
  run_id: string;
  version: number;
  // review-pass v0.1: `content_path` removed from Rust→renderer
  // payload to avoid leaking absolute filesystem paths to the UI.
  content: string | null;
}

function rowToPlanSummary(row: PlanRowRaw): PlanSummary | null {
  if (!row.content) return null;
  try {
    const parsed = JSON.parse(row.content) as {
      goal?: string;
      tasks?: Array<{
        id: string;
        role: PlanTask['agentRole'];
        title?: string;
        goal?: string;
        dependsOn?: string[];
      }>;
      createdAt?: string;
    };
    return {
      id: row.id,
      runId: row.run_id,
      version: row.version,
      // Same rationale as postedAt: prefer server-stamped time over
      // wall clock so renders are stable across polls.
      createdAt: parsed.createdAt ?? new Date(0).toISOString(),
      tasks: (parsed.tasks ?? []).map((t) => ({
        id: t.id,
        agentRole: t.role,
        title: t.title ?? t.goal ?? t.id,
        ...(t.dependsOn && t.dependsOn.length > 0 ? { dependsOn: t.dependsOn } : {}),
      })),
    };
  } catch {
    return null;
  }
}

export function makeTauriPlanListTransport(): PlanListTransport {
  return {
    subscribe(runId, onList) {
      return makePollingLoop(`plans_list(${runId})`, async () => {
        const rows = await invoke<PlanRowRaw[]>('plans_list', {
          args: { run_id: runId },
        });
        const summaries = rows.map(rowToPlanSummary).filter((s): s is PlanSummary => s !== null);
        onList(summaries);
      });
    },
  };
}

// --- final review -----------------------------------------------------

export function makeTauriFinalReviewTransport(): FinalReviewTransport {
  // review-pass v0.1: cache the latest final-review checkpoint id so
  // `decide()` doesn't have to re-fetch the list (and race the
  // polling loop). The closure is per-transport-instance.
  let latestFinalId: string | null = null;
  return {
    subscribe(runId, onReport) {
      return makePollingLoop(`final-review-poll(${runId})`, async () => {
        const rows = await invoke<CheckpointRowRaw[]>('checkpoints_list', {
          args: { run_id: runId },
        });
        const final = rows.find((r) => r.kind === 'final-review');
        if (final) {
          latestFinalId = final.id;
          const report: FinalReportSummary = {
            runId,
            generatedAt: final.created_at ?? new Date(0).toISOString(),
            markdown: final.prompt,
            branches: [],
          };
          onReport(report);
        } else {
          latestFinalId = null;
          onReport(null);
        }
      });
    },
    async decide(_runId, decision) {
      const id = latestFinalId;
      if (!id) {
        throw new Error('decide: no pending final-review checkpoint');
      }
      const response = decision === 'approve' ? 'approve' : 'reject';
      await invoke('checkpoints_answer', { args: { id, response } });
    },
  };
}

// --- wiki -------------------------------------------------------------

/** v0.1: wiki ask is deferred. Returns the empty fallback so the UI
 *  shows "no relevant entry yet" instead of crashing. v0.1.x will add
 *  a `wiki_ask` Tauri command that spawns `beaver wiki ask` sidecar.
 *
 *  review-pass v0.1: warning state lives inside the factory closure
 *  so each call to `makeTauriAskWikiTransport()` is independent —
 *  HMR re-evaluation and test isolation behave correctly. */
export function makeTauriAskWikiTransport(): AskWikiTransport {
  let warned = false;
  return {
    async ask(_question, _signal) {
      if (!warned) {
        warned = true;
        // eslint-disable-next-line no-console
        console.warn('[beaver/tauri] wiki transport pending v0.1.x');
      }
      return { text: '', citations: [], empty: true };
    },
  };
}
