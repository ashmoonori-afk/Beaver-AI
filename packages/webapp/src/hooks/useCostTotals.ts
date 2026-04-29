// Live cost totals transport for the LivePane counter. v0.2 M3.4.
//
// Polls `cost_ticks_totals` so the running tokens / USD never drift
// out of sync with what the sidecar wrote. SQLite SUMs the rows on
// the Rust side; this hook just forwards the result.

import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { isTauri } from '../lib/tauriRuntime.js';

const POLL_MS = 1500;

export interface CostTotals {
  tokensIn: number;
  tokensOut: number;
  usd: number;
}

interface RawTotals {
  tokens_in: number;
  tokens_out: number;
  usd: number;
}

export interface UseCostTotalsResult {
  totals: CostTotals;
  loading: boolean;
  error: string | null;
}

const ZERO: CostTotals = { tokensIn: 0, tokensOut: 0, usd: 0 };

/** Subscribe to live cost totals for the active run. Returns zero
 *  when there's no run, when not in Tauri, or before the first poll
 *  resolves. */
export function useCostTotals(runId: string | null): UseCostTotalsResult {
  const [totals, setTotals] = useState<CostTotals>(ZERO);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || !isTauri()) {
      setLoading(false);
      setTotals(ZERO);
      return undefined;
    }
    let cancelled = false;
    const tick = async (): Promise<void> => {
      try {
        const raw = await invoke<RawTotals>('cost_ticks_totals', {
          args: { run_id: runId },
        });
        if (cancelled) return;
        setTotals({
          tokensIn: raw.tokens_in,
          tokensOut: raw.tokens_out,
          usd: raw.usd,
        });
        setError(null);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runId]);

  return { totals, loading, error };
}
