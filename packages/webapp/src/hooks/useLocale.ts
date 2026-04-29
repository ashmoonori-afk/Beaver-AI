// Phase 4-B — locale state with localStorage persistence. Defaults
// to whatever `navigator.language` suggests so a Korean browser
// gets Korean copy on first launch without any setting.

import { useCallback, useEffect, useState } from 'react';

import { LOCALES, detectLocale, type Locale } from '../i18n/index.js';

const STORAGE_KEY = 'beaver.locale';

export interface LocaleController {
  locale: Locale;
  setLocale: (next: Locale) => void;
}

interface UseLocaleOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Test seam — inject a deterministic language string. */
  navigatorLanguage?: string;
}

function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readPersisted(storage: Pick<Storage, 'getItem'> | null, fallback: Locale): Locale {
  const raw = storage?.getItem(STORAGE_KEY);
  if (raw && (LOCALES as readonly string[]).includes(raw)) {
    return raw as Locale;
  }
  return fallback;
}

export function useLocale(opts: UseLocaleOptions = {}): LocaleController {
  const storage = opts.storage ?? defaultStorage();
  const navigatorLanguage =
    opts.navigatorLanguage ?? (typeof navigator !== 'undefined' ? navigator.language : undefined);
  const detected = detectLocale(navigatorLanguage);
  const [locale, setLocaleState] = useState<Locale>(readPersisted(storage, detected));

  useEffect(() => {
    setLocaleState(readPersisted(storage, detected));
  }, [storage, detected]);

  const setLocale = useCallback(
    (next: Locale) => {
      try {
        storage?.setItem(STORAGE_KEY, next);
      } catch {
        /* persistence is best-effort */
      }
      setLocaleState(next);
    },
    [storage],
  );

  return { locale, setLocale };
}

export const __test__ = { STORAGE_KEY };
