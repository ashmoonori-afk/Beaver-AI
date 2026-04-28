// W.12.7 — active project folder state for the desktop shell.
//
// The Tauri Rust side owns the canonical workspace path (env-seeded,
// restored from app-config on launch, or set by the picker). The hook
// keeps a renderer-side mirror so the header can show the path and the
// GoalBox empty state can prompt the user to pick when nothing is set.

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

import { isTauri } from '../lib/tauriRuntime.js';

export interface WorkspaceState {
  /** Absolute path to the active project folder, or null when nothing
   *  has been picked yet. Browser-mode (mock) always reports null —
   *  the picker is a Tauri-only feature. */
  path: string | null;
  /** True until the initial `workspace_get` round-trip resolves. */
  loading: boolean;
  /** Last error message from a pick or set call, cleared on success. */
  error: string | null;
  /** Open the OS folder picker; on success, refreshes `path`. Returns
   *  the selected path (or null when cancelled). Browser-mode resolves
   *  with null without invoking anything. */
  pick: () => Promise<string | null>;
}

interface PickResultRaw {
  path: string | null;
}

export function useWorkspace(): WorkspaceState {
  const [path, setPath] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Seed from workspace_get on mount. Browser-mode skips the round-trip
  // entirely so vitest jsdom and dev-mode don't try to bind to a Tauri
  // runtime that isn't there.
  useEffect(() => {
    if (!isTauri()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const current = await invoke<string | null>('workspace_get');
        if (!cancelled) setPath(current ?? null);
      } catch (err: unknown) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.error('[beaver/workspace] workspace_get failed', err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pick = useCallback(async (): Promise<string | null> => {
    if (!isTauri()) return null;
    try {
      const result = await invoke<PickResultRaw>('workspace_pick');
      const next = result?.path ?? null;
      setPath(next);
      setError(null);
      return next;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      return null;
    }
  }, []);

  return { path, loading, error, pick };
}
