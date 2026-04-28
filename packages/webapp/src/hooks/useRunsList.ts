// UX-2 / UX-3 — run history hook.
//
// Polls the Tauri `runs_list` command so the renderer can render every
// past run in the active workspace, including pending ones (eg. a run
// that's blocked on a final-review checkpoint the user closed earlier).
// Browser dev mode returns an empty list — there's no in-memory mock
// run history to surface.

import { useEffect, useState } from 'react';

import { invoke } from '@tauri-apps/api/core';

import { isTauri } from '../lib/tauriRuntime.js';

export interface RunHistoryItem {
  id: string;
  goal: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  spentUsd: number;
  budgetUsd: number;
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

const POLL_MS = 4000;

function rowToItem(row: RunRowRaw): RunHistoryItem {
  return {
    id: row.id,
    goal: row.goal,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    spentUsd: row.spent_usd,
    budgetUsd: row.budget_usd,
  };
}

export function useRunsList(): RunHistoryItem[] {
  const [items, setItems] = useState<RunHistoryItem[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const rows = await invoke<RunRowRaw[]>('runs_list', { args: { limit: 50 } });
        if (!cancelled) setItems(rows.map(rowToItem));
      } catch (err: unknown) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[beaver/runs] runs_list failed', err);
        }
      }
      if (!cancelled) setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, []);

  return items;
}
