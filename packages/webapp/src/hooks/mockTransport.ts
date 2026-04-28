// In-memory snapshot transport for the W.3 sprint demo + tests.
// Calls back synchronously with the seed value, then schedules a small
// state machine that walks PLANNING -> EXECUTING -> COMPLETED so the
// bento visibly animates. Replaced by the Tauri transport in 4D.2.

import type { RunSnapshot } from '../types.js';
import type { RunSnapshotTransport } from './useRunSnapshot.js';

// 5 s ticks make the demo state-machine animation browsable — at 1.5 s
// the run flashes through PLANNING → EXECUTING → COMPLETED faster than
// a user can read the bento.
const TICK_MS = 5000;

const TOKEN_CAP_TOTAL = 1_000_000;

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
          tokens: { input: 1_200, output: 200, cached: 0 },
          tokenCap: { total: TOKEN_CAP_TOTAL },
          costMode: 'tokens',
          agents: [
            {
              id: `${runId}-planner`,
              role: 'planner',
              provider: 'claude-code',
              status: 'running',
              spentUsd: 0,
              tokens: { input: 1_200, output: 200, cached: 0 },
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
              tokens: { input: 18_400, output: 6_200, cached: 4_800 },
              tokenCap: { total: TOKEN_CAP_TOTAL },
              costMode: 'tokens',
              agents: [
                {
                  id: `${runId}-planner`,
                  role: 'planner',
                  provider: 'claude-code',
                  status: 'completed',
                  spentUsd: 0.12,
                  tokens: { input: 4_400, output: 1_200, cached: 1_500 },
                },
                {
                  id: `${runId}-coder`,
                  role: 'coder',
                  provider: 'codex',
                  status: 'running',
                  spentUsd: 0.3,
                  tokens: { input: 14_000, output: 5_000, cached: 3_300 },
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
                tokens: { input: 32_000, output: 11_500, cached: 9_200 },
                tokenCap: { total: TOKEN_CAP_TOTAL },
                costMode: 'tokens',
                agents: [
                  {
                    id: `${runId}-planner`,
                    role: 'planner',
                    provider: 'claude-code',
                    status: 'completed',
                    spentUsd: 0.12,
                    tokens: { input: 4_400, output: 1_200, cached: 1_500 },
                  },
                  {
                    id: `${runId}-coder`,
                    role: 'coder',
                    provider: 'codex',
                    status: 'completed',
                    spentUsd: 0.59,
                    tokens: { input: 27_600, output: 10_300, cached: 7_700 },
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
