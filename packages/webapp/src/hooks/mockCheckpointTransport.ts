// In-memory checkpoint transport for the W.4 sprint demo + tests.
// Seeds two pending checkpoints (one approve-style, one budget-exceeded)
// and removes them from the list on `answer`. Replaced by the Tauri
// transport in 4D.2.

import type { CheckpointSummary } from '../types.js';
import type { CheckpointTransport } from './useCheckpoints.js';

function seedFor(runId: string): CheckpointSummary[] {
  const now = new Date().toISOString();
  return [
    {
      id: `${runId}-cp-plan`,
      runId,
      kind: 'plan-approval',
      prompt:
        'Drafted a 4-step plan: scaffold, schema, route, smoke test. Approve to start execution.',
      postedAt: now,
      hint: {
        text: 'Last time we approved a similar plan, the schema step blew the budget.',
        sourcePages: ['runs/2026-04-21-billing.md'],
      },
    },
    {
      id: `${runId}-cp-budget`,
      runId,
      kind: 'budget-exceeded',
      prompt: 'Budget cap of $20 reached. Stop, raise the cap, or run one more step?',
      postedAt: now,
    },
  ];
}

export function makeMockCheckpointTransport(): CheckpointTransport {
  const lists = new Map<string, CheckpointSummary[]>();
  const listeners = new Map<string, Set<(list: readonly CheckpointSummary[]) => void>>();

  function emit(runId: string): void {
    const list = lists.get(runId) ?? [];
    const subs = listeners.get(runId);
    if (!subs) return;
    for (const fn of subs) fn(list);
  }

  return {
    subscribe(runId, onList) {
      if (!lists.has(runId)) lists.set(runId, seedFor(runId));
      const subs = listeners.get(runId) ?? new Set();
      subs.add(onList);
      listeners.set(runId, subs);
      // initial emit
      onList(lists.get(runId) ?? []);
      return () => {
        subs.delete(onList);
        if (subs.size === 0) listeners.delete(runId);
      };
    },
    async answer(id, _response) {
      for (const [runId, list] of lists) {
        const next = list.filter((cp) => cp.id !== id);
        if (next.length !== list.length) {
          lists.set(runId, next);
          emit(runId);
          return;
        }
      }
      throw new Error(`mock answer: no such checkpoint id='${id}'`);
    },
  };
}
