// v0.1.1-E — auto-update hook.
//
// On Tauri startup, checks GitHub Releases for a newer version. When
// found, exposes an `apply()` callback that downloads + installs +
// restarts. The check runs at most once per app session and silently
// no-ops outside Tauri (browser dev mode).

import { useCallback, useEffect, useState } from 'react';

import { isTauri } from '../lib/tauriRuntime.js';

export interface UpdateState {
  /** Newer version available, ready to install. */
  available: boolean;
  /** Version string from latest.json (e.g. "0.1.2"). */
  version: string | null;
  /** Release notes from latest.json (markdown). */
  notes: string | null;
  /** Status of the apply flow. */
  status: 'idle' | 'downloading' | 'restarting' | 'error';
  /** Error message when status === 'error'. */
  error: string | null;
  /** Trigger download → install → relaunch. No-op when !available. */
  apply: () => Promise<void>;
  /** Dismiss the update prompt for this session. */
  dismiss: () => void;
}

interface UpdateApi {
  check: () => Promise<{
    available: boolean;
    version?: string;
    body?: string;
    downloadAndInstall: (
      cb?: (event: { event: 'Started' | 'Progress' | 'Finished' }) => void,
    ) => Promise<void>;
  } | null>;
}

interface ProcessApi {
  relaunch: () => Promise<void>;
}

export function useUpdateCheck(): UpdateState {
  const [available, setAvailable] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateState['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pendingUpdate, setPendingUpdate] = useState<Awaited<
    ReturnType<UpdateApi['check']>
  > | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void (async () => {
      try {
        const updaterMod = (await import('@tauri-apps/plugin-updater')) as unknown as UpdateApi;
        const update = await updaterMod.check();
        if (cancelled || !update?.available) return;
        setPendingUpdate(update);
        setAvailable(true);
        setVersion(update.version ?? null);
        setNotes(update.body ?? null);
      } catch (err: unknown) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[beaver/updater] check failed', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = useCallback(async () => {
    if (!pendingUpdate || !isTauri()) return;
    setStatus('downloading');
    setError(null);
    try {
      await pendingUpdate.downloadAndInstall();
      setStatus('restarting');
      // Phase 0 review-pass: drain any active sidecar runs BEFORE
      // relaunch — RunEvent::Exit doesn't fire reliably on the
      // relaunch path, so without this children get orphaned.
      try {
        const coreMod = (await import('@tauri-apps/api/core')) as unknown as {
          invoke: (cmd: string) => Promise<void>;
        };
        await coreMod.invoke('drain_active_runs');
      } catch {
        // best-effort; relaunch still proceeds
      }
      const processMod = (await import('@tauri-apps/plugin-process')) as unknown as ProcessApi;
      // Phase 0 review-pass: hard timeout on relaunch so the banner
      // can't stay in "Restarting…" forever if the OS rejects the
      // relaunch (rare but possible on macOS Gatekeeper).
      await Promise.race([
        processMod.relaunch(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('relaunch timed out after 10s')), 10_000),
        ),
      ]);
    } catch (err: unknown) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [pendingUpdate]);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  return {
    available: available && !dismissed,
    version,
    notes,
    status,
    error,
    apply,
    dismiss,
  };
}
