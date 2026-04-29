// Live log lines transport for the LivePane. v0.2 M3.3.
//
// Polls the `log_lines_list` Tauri command on a 1500 ms cadence using
// an id cursor so each tick only ships new rows. Rows accumulate in
// renderer state up to MAX_LINES so the virtualized list never blows
// up under a chatty coder.

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isTauri } from '../lib/tauriRuntime.js';

const POLL_MS = 1500;
const MAX_LINES = 5_000;

export interface LogLine {
  id: number;
  ts: string;
  source: string;
  stream: 'stdout' | 'stderr' | string;
  text: string;
}

interface RawLine {
  id: number;
  run_id: string;
  ts: string;
  source: string;
  stream: string;
  text: string;
}

export interface UseLogLinesResult {
  lines: LogLine[];
  loading: boolean;
  error: string | null;
}

/** Subscribe to live log lines for the active run. Stays idle when
 *  `runId` is null OR not running inside Tauri (browser dev mode). */
export function useLogLines(runId: string | null): UseLogLinesResult {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const sinceRef = useRef<number>(-1);

  const reset = useCallback(() => {
    setLines([]);
    sinceRef.current = -1;
  }, []);

  useEffect(() => {
    if (!runId || !isTauri()) {
      setLoading(false);
      reset();
      return undefined;
    }
    let cancelled = false;

    const tick = async (): Promise<void> => {
      try {
        const raw = await invoke<RawLine[]>('log_lines_list', {
          args: { run_id: runId, since: sinceRef.current, limit: 1_000 },
        });
        if (cancelled) return;
        if (raw.length > 0) {
          const incoming = raw.map<LogLine>((r) => ({
            id: r.id,
            ts: r.ts,
            source: r.source,
            stream: r.stream,
            text: r.text,
          }));
          sinceRef.current = raw[raw.length - 1]!.id;
          setLines((prev) => {
            const merged = prev.concat(incoming);
            // Soft-cap so a chatty run doesn't OOM the renderer.
            if (merged.length > MAX_LINES) {
              return merged.slice(merged.length - MAX_LINES);
            }
            return merged;
          });
        }
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
  }, [runId, reset]);

  return { lines, loading, error };
}
