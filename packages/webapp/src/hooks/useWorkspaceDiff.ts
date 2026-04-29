// Phase 1-B — fetch the workspace's pending git diff via Tauri.
//
// Returns idle / loading / ready / error state. The component triggers
// `refresh()` to request a fresh diff (e.g. after a run completes).
// Browser dev mode never invokes Tauri; the hook returns a permanently
// idle state so component shells render the same way.

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useState } from 'react';

import { isTauri } from '../lib/tauriRuntime.js';

export type DiffState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; diff: string }
  | { status: 'error'; message: string };

export interface UseWorkspaceDiffResult {
  state: DiffState;
  /** Fetch a fresh diff from `git diff HEAD`. Safe to call repeatedly. */
  refresh: () => Promise<void>;
}

export function useWorkspaceDiff(): UseWorkspaceDiffResult {
  const [state, setState] = useState<DiffState>({ status: 'idle' });

  const refresh = useCallback(async (): Promise<void> => {
    if (!isTauri()) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    try {
      const diff = await invoke<string>('workspace_diff');
      setState({ status: 'ready', diff });
    } catch (err: unknown) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  return { state, refresh };
}
