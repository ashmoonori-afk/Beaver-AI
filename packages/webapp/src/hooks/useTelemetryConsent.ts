// Phase 4-A — telemetry consent. Privacy-first: defaults to
// `opted-out`, persisted in localStorage. v0.1.x ships the consent
// UX only — no events are actually sent yet. The scaffold is here so
// future phases can flip on collection without changing the UX.
//
// Storage key uses a different namespace from the onboarding flag
// so wiping one doesn't change the other.

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'beaver.telemetry.consent';
type Persisted = 'opted-in' | 'opted-out';

export type TelemetryConsent = 'opted-in' | 'opted-out';

export interface TelemetryController {
  consent: TelemetryConsent;
  optIn: () => void;
  optOut: () => void;
}

interface UseTelemetryOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPersisted(storage: Pick<Storage, 'getItem'> | null): Persisted {
  const raw = storage?.getItem(STORAGE_KEY);
  return raw === 'opted-in' ? 'opted-in' : 'opted-out';
}

export function useTelemetryConsent(opts: UseTelemetryOptions = {}): TelemetryController {
  const storage = opts.storage ?? defaultStorage();
  const [consent, setConsent] = useState<TelemetryConsent>(readPersisted(storage));

  // The first render returns whatever readPersisted decided. The
  // effect re-syncs on mount in case the storage reference changed
  // (test scenarios that swap storages between renders).
  useEffect(() => {
    setConsent(readPersisted(storage));
  }, [storage]);

  const optIn = useCallback(() => {
    try {
      storage?.setItem(STORAGE_KEY, 'opted-in');
    } catch {
      /* persistence is best-effort */
    }
    setConsent('opted-in');
  }, [storage]);

  const optOut = useCallback(() => {
    try {
      storage?.setItem(STORAGE_KEY, 'opted-out');
    } catch {
      /* ignore */
    }
    setConsent('opted-out');
  }, [storage]);

  return { consent, optIn, optOut };
}

export const __test__ = { STORAGE_KEY };
