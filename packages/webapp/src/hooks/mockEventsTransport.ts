// In-memory event stream for the W.5 demo + tests. Walks 4 events at
// 400 ms ticks; cancellable via the cleanup return. Replaced by the
// Tauri transport in 4D.2.

import type { LogEvent } from '../types.js';
import type { EventsTransport } from './useEvents.js';

const SEED: ReadonlyArray<Omit<LogEvent, 'runId' | 'id' | 'ts'>> = [
  { level: 'info', source: 'orchestrator', message: 'Run started.' },
  { level: 'info', source: 'claude-code', message: 'Planner: drafted 3-step plan.' },
  {
    level: 'warn',
    source: 'hook',
    message: 'PreToolUse: write to packages/server/.env was blocked by policy.',
  },
  {
    level: 'info',
    source: 'codex',
    message: 'Coder: wrote packages/server/src/users.ts (62 lines).',
  },
];

const TICK_MS = 400;

export function makeMockEventsTransport(): EventsTransport {
  return {
    subscribe(runId, onEvent) {
      let cancelled = false;
      let i = 0;
      const tick = (): void => {
        if (cancelled || i >= SEED.length) return;
        const seed = SEED[i]!;
        const ts = new Date().toISOString();
        const ev: LogEvent = {
          id: `${runId}-ev-${i}`,
          runId,
          ts,
          level: seed.level,
          source: seed.source,
          message: seed.message,
          raw: JSON.stringify({ ts, level: seed.level, source: seed.source, msg: seed.message }),
        };
        onEvent(ev);
        i += 1;
        if (i < SEED.length) setTimeout(tick, TICK_MS);
      };
      tick();
      return () => {
        cancelled = true;
      };
    },
  };
}
