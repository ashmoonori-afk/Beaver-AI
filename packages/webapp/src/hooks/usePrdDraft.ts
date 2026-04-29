// PRD draft transport for the renderer. v0.2 M1.3a.
//
// Reads `<workspace>/.beaver/prd-draft.md` via the Tauri command
// `prd_get_draft` and pushes user edits back via `prd_save_draft`.
// Component owns the debounce — this hook is a thin invoke wrapper so
// tests can mock the IPC layer directly. Browser dev mode (no
// `isTauri()`) returns a permanently empty draft so the PRDPane shell
// renders the same way it does in tests.
//
// Polls every POLL_MS so the orchestrator's writes (M1.3b — separate
// iter) surface in the UI without explicit invalidation. The poll is
// cheap because the file is on local disk and capped at 256 KB.

import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { isTauri } from '../lib/tauriRuntime.js';

const DEFAULT_POLL_MS = 1500;

export interface UsePrdDraftOptions {
  /** Poll interval in ms. Default 1500. Set to 0 to disable polling
   *  (one-shot read on mount + manual refresh only) — useful for
   *  tests and any caller that wires its own invalidation. */
  pollMs?: number;
}

interface RawDraft {
  markdown: string;
  exists: boolean;
  bytes: number;
}

export interface PrdDraftState {
  /** Most recent markdown body. Empty string when the draft is missing
   *  or when the hook is disabled (browser dev mode). */
  markdown: string;
  /** False when the file does not exist on disk yet. */
  exists: boolean;
  /** True only on the first load before the initial fetch resolves. */
  loading: boolean;
  /** Last error message from a failed get/save, or null when healthy. */
  error: string | null;
  /** Force a fresh read. Idempotent; the polling loop calls this too. */
  refresh: () => Promise<void>;
  /** Replace the on-disk draft with `markdown`. Optimistically updates
   *  the local state so the textarea doesn't flicker between save and
   *  the next poll. Reverts on save failure. */
  save: (markdown: string) => Promise<void>;
}

/** Subscribe the component to the active workspace's PRD draft. Pass
 *  `enabled=false` from any caller that knows the pane is hidden so
 *  the polling loop and IPC traffic stay quiet. */
export function usePrdDraft(enabled: boolean, options: UsePrdDraftOptions = {}): PrdDraftState {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  const [markdown, setMarkdown] = useState<string>('');
  const [exists, setExists] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Track latest local-only edit so a poll that lands AFTER a save
  // doesn't overwrite an in-flight user edit with stale on-disk text.
  const lastSaveAtRef = useRef<number>(0);
  const lastSaveBodyRef = useRef<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled || !isTauri()) {
      setLoading(false);
      return;
    }
    try {
      const raw = await invoke<RawDraft>('prd_get_draft');
      // If the on-disk text matches the body we just saved, accept it
      // and forget the in-flight marker. Otherwise the orchestrator
      // (or another tab) wrote new content — adopt it unless the user
      // is mid-edit (last save < pollMs ago AND content differs).
      const recentSave =
        pollMs > 0 ? Date.now() - lastSaveAtRef.current < pollMs : false;
      const lastBody = lastSaveBodyRef.current;
      if (lastBody !== null && raw.markdown === lastBody) {
        lastSaveBodyRef.current = null;
      }
      if (!recentSave || raw.markdown === lastBody) {
        setMarkdown(raw.markdown);
        setExists(raw.exists);
      }
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [enabled, pollMs]);

  const save = useCallback(
    async (next: string): Promise<void> => {
      if (!enabled || !isTauri()) return;
      const previous = markdown;
      // Optimistic update so the textarea stays smooth.
      setMarkdown(next);
      setExists(true);
      lastSaveAtRef.current = Date.now();
      lastSaveBodyRef.current = next;
      try {
        await invoke('prd_save_draft', { args: { markdown: next } });
        setError(null);
      } catch (err: unknown) {
        // Rollback so the user sees the previous text and can retry.
        setMarkdown(previous);
        lastSaveBodyRef.current = null;
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [enabled, markdown],
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    void refresh();
    if (pollMs <= 0) return undefined;
    const id = setInterval(() => {
      void refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [enabled, refresh, pollMs]);

  return { markdown, exists, loading, error, refresh, save };
}
