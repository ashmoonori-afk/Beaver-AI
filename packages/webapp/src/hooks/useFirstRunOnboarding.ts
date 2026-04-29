// Phase 3-A — first-run onboarding controller. Reads/writes a single
// localStorage flag so the welcome dialog only shows on the first
// launch. Hook returns `{ open, complete, skip }` so the renderer
// can drive the dialog without owning the storage mechanism.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'beaver.onboarding.completed';

export interface FirstRunController {
  /** True while the onboarding dialog should render. */
  open: boolean;
  /** Mark onboarding completed (or dismissed via Skip). After this
   *  the flag persists and the dialog never reopens for this user. */
  complete: () => void;
  /** Manually re-open onboarding — used by tests and (future) a
   *  "Replay tour" link in the help dialog. */
  reopen: () => void;
}

interface UseFirstRunOptions {
  /** When false, onboarding is suppressed regardless of localStorage.
   *  Caller passes `desktop` so browser dev mode doesn't show it. */
  enabled: boolean;
  /** Test seam — inject a fake storage so we don't poison the
   *  jsdom localStorage between tests. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    // Some browser configs (private mode, restricted iframes) throw
    // when localStorage is touched. Treat as "no storage" — the
    // dialog still works, just won't remember its dismissal.
    return null;
  }
}

export function useFirstRunOnboarding(opts: UseFirstRunOptions): FirstRunController {
  const storage = opts.storage ?? defaultStorage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!opts.enabled) {
      setOpen(false);
      return;
    }
    const seen = storage?.getItem(STORAGE_KEY);
    setOpen(seen !== '1');
  }, [opts.enabled, storage]);

  const complete = useCallback(() => {
    try {
      storage?.setItem(STORAGE_KEY, '1');
    } catch {
      // Persistence failure is non-fatal — the in-memory state still
      // hides the dialog for the rest of this session.
    }
    setOpen(false);
  }, [storage]);

  const reopen = useCallback(() => {
    try {
      storage?.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setOpen(true);
  }, [storage]);

  return { open, complete, reopen };
}

export const __test__ = { STORAGE_KEY };
