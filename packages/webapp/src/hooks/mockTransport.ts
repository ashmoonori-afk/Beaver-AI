// In-memory snapshot transport for the W.3 sprint demo + tests.
// Calls back synchronously with the seed value, then schedules a small
// state machine that walks PLANNING -> EXECUTING -> COMPLETED so the
// bento visibly animates. Replaced by the Tauri transport in 4D.2.

import type { RunSnapshot } from '../types.js';
import type { RunSnapshotTransport } from './useRunSnapshot.js';

const TICK_MS = 1500;

export function makeMockTransport(initialGoal: string): RunSnapshotTransport {
  return {
    subscribe(runId, onSnapshot) {
      const startedAt = new Date().toISOString();
      let cancelled = false;
      const tick = (snapshot: RunSnapshot, next?: () => void): void => {
        if (cancelled) return;
        onSnapshot(snapshot);
        if (next) setTimeout(next, TICK_MS);
      };

      const goalSlice = initialGoal.slice(0, 60);

      tick(
        {
          runId,
          state: 'PLANNING',
          startedAt,
          spentUsd: 0,
          budgetUsd: 20,
          agents: [
            {
              id: `${runId}-planner`,
              role: 'planner',
              provider: 'claude-code',
              status: 'running',
              spentUsd: 0,
              lastLine: `Planning: ${goalSlice}`,
            },
          ],
          openCheckpoints: 0,
        },
        () =>
          tick(
            {
              runId,
              state: 'EXECUTING',
              startedAt,
              spentUsd: 0.42,
              budgetUsd: 20,
              agents: [
                {
                  id: `${runId}-planner`,
                  role: 'planner',
                  provider: 'claude-code',
                  status: 'completed',
                  spentUsd: 0.12,
                },
                {
                  id: `${runId}-coder`,
                  role: 'coder',
                  provider: 'codex',
                  status: 'running',
                  spentUsd: 0.3,
                  lastLine: 'Writing files…',
                },
              ],
              openCheckpoints: 0,
            },
            () =>
              tick({
                runId,
                state: 'COMPLETED',
                startedAt,
                endedAt: new Date().toISOString(),
                spentUsd: 0.71,
                budgetUsd: 20,
                agents: [
                  {
                    id: `${runId}-planner`,
                    role: 'planner',
                    provider: 'claude-code',
                    status: 'completed',
                    spentUsd: 0.12,
                  },
                  {
                    id: `${runId}-coder`,
                    role: 'coder',
                    provider: 'codex',
                    status: 'completed',
                    spentUsd: 0.59,
                    lastLine: 'Wrote 4 files in 12 s.',
                  },
                ],
                openCheckpoints: 0,
              }),
          ),
      );

      return () => {
        cancelled = true;
      };
    },
  };
}
