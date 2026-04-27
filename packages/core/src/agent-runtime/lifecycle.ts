// Agent lifecycle wrapper: wraps a ProviderAdapter.run() with
//   1) wall-clock timeout per TaskRole (planner=5m, coder=30m, ...),
//   2) a stall watchdog (no events for stallThresholdMs => kill),
//   3) lifecycle events (`agent.spawned`, `agent.completed`, `agent.stalled`,
//      `agent.timed_out`) appended to the events table via insertEvent.
//
// Spaghetti rule: ONE setInterval shared across every concurrent agent.
// The watchdog is a module-level singleton; agents register/unregister on
// run start/finish. The interval is torn down when the registry is empty.
//
// Never calls process.exit(). All timers cleared in finally blocks.

import type { TaskRole } from '../plan/schema.js';
import type { AgentEvent } from '../types/event.js';
import type { ProviderAdapter, RunOptions, RunResult } from '../types/provider.js';
import { insertEvent } from '../workspace/dao/events.js';
import type { Db } from '../workspace/db.js';

const MS_PER_MINUTE = 60_000;
const DEFAULT_TIMEOUT_MINUTES: Readonly<Record<TaskRole, number>> = {
  planner: 5,
  coder: 30,
  reviewer: 10,
  tester: 20,
  integrator: 15,
  summarizer: 5,
};
const DEFAULT_STALL_THRESHOLD_MS = 120_000;
const DEFAULT_STALL_CHECK_MS = 10_000;

export interface RunAgentOptions {
  adapter: ProviderAdapter;
  db: Db;
  runId: string;
  agentId: string;
  role: TaskRole;
  /** Forwarded to the adapter. onEvent is wrapped to drive the watchdog. */
  runOptions: Omit<RunOptions, 'signal'>;
  /** Override default per-role wall-clock timeout (minutes). */
  timeoutMinutes?: number;
  /** Override stall threshold (default 120_000 ms). Tests use small values. */
  stallThresholdMs?: number;
  /** Override watchdog tick interval (default 10_000 ms). Tests use small values. */
  stallCheckMs?: number;
}

interface WatchedAgent {
  lastOutputTs: number;
  abort: AbortController;
  thresholdMs: number;
  onStall: () => void;
}

// Module-level singleton state. NEVER per-agent setInterval.
const watchedAgents = new Map<string, WatchedAgent>();
let watchdogTimer: NodeJS.Timeout | null = null;
let watchdogTickMs = DEFAULT_STALL_CHECK_MS;

function startWatchdog(tickMs: number): void {
  if (watchdogTimer !== null) return;
  watchdogTickMs = tickMs;
  watchdogTimer = setInterval(() => {
    const now = Date.now();
    for (const agent of watchedAgents.values()) {
      if (now - agent.lastOutputTs > agent.thresholdMs) {
        agent.onStall();
      }
    }
  }, tickMs);
  // Don't keep the event loop alive for the watchdog alone.
  watchdogTimer.unref?.();
}

function stopWatchdogIfIdle(): void {
  if (watchedAgents.size === 0 && watchdogTimer !== null) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function registerAgent(key: string, agent: WatchedAgent, tickMs: number): void {
  // If a previous run requested a smaller tick, prefer the smaller one
  // so test thresholds are honored even when production agents run alongside.
  if (watchdogTimer !== null && tickMs < watchdogTickMs) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  watchedAgents.set(key, agent);
  startWatchdog(tickMs);
}

function unregisterAgent(key: string): void {
  watchedAgents.delete(key);
  stopWatchdogIfIdle();
}

function writeLifecycleEvent(
  db: Db,
  runId: string,
  agentId: string,
  type: string,
  payload?: unknown,
): void {
  insertEvent(db, {
    run_id: runId,
    ts: new Date().toISOString(),
    source: agentId,
    type,
    payload_json: payload === undefined ? null : JSON.stringify(payload),
  });
}

export async function runAgent(opts: RunAgentOptions): Promise<RunResult> {
  const timeoutMin = opts.timeoutMinutes ?? DEFAULT_TIMEOUT_MINUTES[opts.role];
  const timeoutMs = timeoutMin * MS_PER_MINUTE;
  const stallThresholdMs = opts.stallThresholdMs ?? DEFAULT_STALL_THRESHOLD_MS;
  const stallCheckMs = opts.stallCheckMs ?? DEFAULT_STALL_CHECK_MS;

  const abort = new AbortController();
  let stalled = false;
  let timedOut = false;

  const watched: WatchedAgent = {
    lastOutputTs: Date.now(),
    abort,
    thresholdMs: stallThresholdMs,
    onStall: () => {
      if (stalled || timedOut) return;
      stalled = true;
      abort.abort();
    },
  };

  const wrappedOnEvent = (event: AgentEvent): void => {
    watched.lastOutputTs = Date.now();
    opts.runOptions.onEvent?.(event);
  };

  const wallClock = setTimeout(() => {
    if (stalled || timedOut) return;
    timedOut = true;
    abort.abort();
  }, timeoutMs);
  wallClock.unref?.();

  registerAgent(opts.agentId, watched, stallCheckMs);
  writeLifecycleEvent(opts.db, opts.runId, opts.agentId, 'agent.spawned', {
    role: opts.role,
    provider: opts.adapter.name,
    timeoutMs,
    stallThresholdMs,
  });

  try {
    const result = await opts.adapter.run({
      ...opts.runOptions,
      onEvent: wrappedOnEvent,
      signal: abort.signal,
    });
    if (stalled) {
      writeLifecycleEvent(opts.db, opts.runId, opts.agentId, 'agent.stalled', {
        thresholdMs: stallThresholdMs,
        adapterStatus: result.status,
      });
    } else if (timedOut) {
      writeLifecycleEvent(opts.db, opts.runId, opts.agentId, 'agent.timed_out', {
        timeoutMs,
        adapterStatus: result.status,
      });
    } else {
      writeLifecycleEvent(opts.db, opts.runId, opts.agentId, 'agent.completed', {
        status: result.status,
        usage: result.usage,
      });
    }
    return result;
  } finally {
    clearTimeout(wallClock);
    unregisterAgent(opts.agentId);
  }
}
