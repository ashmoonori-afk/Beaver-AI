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
      id: `${runId}-cp-refine`,
      runId,
      kind: 'goal-refinement',
      prompt: 'Approve the enriched goal + PRD + MVP, or comment to amend any section.',
      postedAt: now,
      refinement: {
        rawGoal: 'build a todo app',
        enrichedGoal:
          'TypeScript + React + Vite TODO app with email/password auth and SQLite persistence. Single-user, desktop only. CRUD on tasks with done/undone toggle.',
        assumptions: [
          'no mobile / web-multi-device sync in v0.1',
          'single-user (one local SQLite file per workspace)',
          'no real-time collaboration',
        ],
        questions: [],
        clarifyingQuestions: [
          {
            id: 'Q1',
            text: 'Which auth model should we ship?',
            options: [
              { label: 'A', value: 'email + password (local hash)' },
              { label: 'B', value: 'OS-level session (no auth)' },
              { label: 'C', value: 'magic link via SMTP' },
            ],
          },
          {
            id: 'Q2',
            text: 'How should completed tasks behave?',
            options: [
              { label: 'A', value: 'kept inline, struck-through' },
              { label: 'B', value: 'archived to a separate view' },
              { label: 'C', value: 'auto-deleted after 30 days' },
            ],
          },
        ],
        prd: {
          overview:
            'A minimal TODO app for local single-user productivity. Tasks live in a SQLite file under the user’s workspace and survive crashes via WAL mode.',
          goals: [
            'create / edit / delete a task in <100 ms',
            'mark tasks done with one click or keyboard shortcut',
            'persist across app restarts without data loss',
          ],
          userStories: [
            {
              id: 'US-001',
              title: 'Create a task',
              description:
                'As a user, I want to type a task and press Enter so that it appears immediately.',
              acceptanceCriteria: [
                'Empty input rejected with inline message',
                'Newly created task is persisted to SQLite before the UI clears',
                'Cursor returns to the input on success',
              ],
            },
            {
              id: 'US-002',
              title: 'Toggle done state',
              description: 'As a user, I want to click a checkbox so that the task is marked done.',
              acceptanceCriteria: [
                'Click toggles in <100 ms',
                'Done state persists across reload',
                'Strike-through visible only for done tasks',
              ],
            },
          ],
          nonGoals: [
            'no multi-device sync',
            'no shared / multi-user lists',
            'no calendar / due-date features in v0.1',
          ],
          successMetrics: [
            'all unit + integration tests pass',
            'manual smoke: 50 tasks created without UI lag',
            'data survives a forced kill-and-restart',
          ],
        },
        mvp: {
          pitch: 'A keyboard-first single-user TODO app that just works offline.',
          features: ['create / edit / delete task', 'toggle done', 'persist to local SQLite'],
          deferred: [
            'auth (treat single user as the OS session for v0.1)',
            'tagging / categories',
            'bulk import from markdown',
          ],
          scope: '~3 days · no auth · no sync',
        },
      },
    },
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
