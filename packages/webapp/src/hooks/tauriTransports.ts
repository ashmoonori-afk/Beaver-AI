// Tauri-backed transport implementations.
//
// W.12.6 — all 6 transports now invoke real Tauri commands. The Rust
// side reads/writes .beaver/beaver.db directly (no NDJSON streaming);
// the renderer polls every POLL_MS for fresh state. Polling is fine
// for v0.1 — the UI is single-user, single-run.
//
// Tauri command surface:
//   runs_start({goal})            -> {runId}
//   runs_get({runId})             -> RunRow | null
//   checkpoints_list({runId})     -> CheckpointRow[]
//   checkpoints_answer({id, response}) -> ()
//   events_list({runId, since?})  -> EventRow[]
//   plans_list({runId})           -> PlanRow[]
//   wiki_ask({question})          -> WikiAnswer  (deferred to v0.1.x)

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

export interface RunStartResult {
  runId: string;
}

const POLL_MS = 1500;

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

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'ABORTED']);

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

/** Polling-based RunSnapshot transport. The previous event-listener
 *  variant assumed the Rust side emits `run.snapshot.<runId>` Tauri
 *  events; v0.1's CLI sidecar writes to SQLite instead. We poll. */
export function makeTauriRunSnapshotTransport(): RunSnapshotTransport {
  return {
    subscribe(runId, onSnapshot) {
      let cancelled = false;
      const tick = async (): Promise<void> => {
        if (cancelled) return;
        try {
          const row = await invoke<RunRowRaw | null>('runs_get', {
            args: { run_id: runId },
          });
          if (cancelled) return;
          if (row) onSnapshot(runRowToSnapshot(row));
        } catch (err: unknown) {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.error(`[beaver/tauri] runs_get(${runId}) failed`, err);
        }
        if (!cancelled) {
          const stop =
            typeof onSnapshot === 'function' &&
            // Stop the loop early if the latest snapshot was terminal.
            // We can't read state here cheaply; just keep polling and
            // let the consumer unsubscribe on terminal.
            false;
          if (!stop) setTimeout(tick, POLL_MS);
        }
      };
      void tick();
      // Fallback: also subscribe to event-bus pushes if the Rust side
      // ever emits them (cheap insurance — no harm if no producer).
      let unlisten: (() => void) | null = null;
      listen<RunSnapshot>(`run.snapshot.${runId}`, (e) => {
        if (cancelled) return;
        onSnapshot(e.payload);
      })
        .then((u) => {
          if (cancelled) {
            u();
            return;
          }
          unlisten = u;
        })
        .catch(() => {
          // No event producer in v0.1; that's fine.
        });
      return () => {
        cancelled = true;
        if (unlisten) unlisten();
      };
    },
  };
}

void TERMINAL_STATUSES; // exported for future smarter polling

// --- checkpoints ------------------------------------------------------

interface CheckpointRowRaw {
  id: string;
  run_id: string;
  kind: string;
  status: string;
  prompt: string;
  response: string | null;
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
    postedAt: new Date().toISOString(),
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
      let cancelled = false;
      const tick = async (): Promise<void> => {
        if (cancelled) return;
        try {
          const rows = await invoke<CheckpointRowRaw[]>('checkpoints_list', {
            args: { run_id: runId },
          });
          if (cancelled) return;
          onList(rows.map(rowToCheckpoint));
        } catch (err: unknown) {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.error(`[beaver/tauri] checkpoints_list(${runId}) failed`, err);
        }
        if (!cancelled) setTimeout(tick, POLL_MS);
      };
      void tick();
      return () => {
        cancelled = true;
      };
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
      let cancelled = false;
      let since = -1;
      const tick = async (): Promise<void> => {
        if (cancelled) return;
        try {
          const rows = await invoke<EventRowRaw[]>('events_list', {
            args: { run_id: runId, since },
          });
          if (cancelled) return;
          for (const row of rows) {
            onEvent(rowToLogEvent(row));
            if (row.id > since) since = row.id;
          }
        } catch (err: unknown) {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.error(`[beaver/tauri] events_list(${runId}) failed`, err);
        }
        if (!cancelled) setTimeout(tick, POLL_MS);
      };
      void tick();
      return () => {
        cancelled = true;
      };
    },
  };
}

// --- plans ------------------------------------------------------------

interface PlanRowRaw {
  id: string;
  run_id: string;
  version: number;
  content_path: string;
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
      createdAt: parsed.createdAt ?? new Date().toISOString(),
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
      let cancelled = false;
      const tick = async (): Promise<void> => {
        if (cancelled) return;
        try {
          const rows = await invoke<PlanRowRaw[]>('plans_list', {
            args: { run_id: runId },
          });
          if (cancelled) return;
          const summaries = rows.map(rowToPlanSummary).filter((s): s is PlanSummary => s !== null);
          onList(summaries);
        } catch (err: unknown) {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.error(`[beaver/tauri] plans_list(${runId}) failed`, err);
        }
        if (!cancelled) setTimeout(tick, POLL_MS);
      };
      void tick();
      return () => {
        cancelled = true;
      };
    },
  };
}

// --- final review -----------------------------------------------------

export function makeTauriFinalReviewTransport(): FinalReviewTransport {
  return {
    subscribe(runId, onReport) {
      // The final-review checkpoint is the source of truth. We poll
      // checkpoints_list and synthesize a FinalReportSummary when one
      // appears with kind='final-review'.
      let cancelled = false;
      const tick = async (): Promise<void> => {
        if (cancelled) return;
        try {
          const rows = await invoke<CheckpointRowRaw[]>('checkpoints_list', {
            args: { run_id: runId },
          });
          if (cancelled) return;
          const final = rows.find((r) => r.kind === 'final-review');
          if (final) {
            const report: FinalReportSummary = {
              runId,
              generatedAt: new Date().toISOString(),
              markdown: final.prompt,
              branches: [],
            };
            onReport(report);
          } else {
            onReport(null);
          }
        } catch (err: unknown) {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.error(`[beaver/tauri] final-review poll(${runId}) failed`, err);
        }
        if (!cancelled) setTimeout(tick, POLL_MS);
      };
      void tick();
      return () => {
        cancelled = true;
      };
    },
    async decide(runId, decision) {
      // Find the final-review checkpoint then write the answer.
      const rows = await invoke<CheckpointRowRaw[]>('checkpoints_list', {
        args: { run_id: runId },
      });
      const final = rows.find((r) => r.kind === 'final-review');
      if (!final) {
        throw new Error('decide: no pending final-review checkpoint');
      }
      const response = decision === 'approve' ? 'approve' : 'reject';
      await invoke('checkpoints_answer', { args: { id: final.id, response } });
    },
  };
}

// --- wiki -------------------------------------------------------------

let wikiWarned = false;

/** v0.1: wiki ask is deferred. Returns the empty fallback so the UI
 *  shows "no relevant entry yet" instead of crashing. v0.1.x will add
 *  a `wiki_ask` Tauri command that spawns `beaver wiki ask` sidecar. */
export function makeTauriAskWikiTransport(): AskWikiTransport {
  return {
    async ask(_question, _signal) {
      if (!wikiWarned) {
        wikiWarned = true;
        // eslint-disable-next-line no-console
        console.warn('[beaver/tauri] wiki transport pending v0.1.x');
      }
      return { text: '', citations: [], empty: true };
    },
  };
}

/** Reset all module-level memos. Test-only. */
export function __resetWarnedForTest(): void {
  wikiWarned = false;
}
