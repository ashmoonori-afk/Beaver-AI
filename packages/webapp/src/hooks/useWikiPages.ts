// Phase 2-C — list .beaver/wiki/ pages for the browse UI. The
// transport boundary lets us wire a Tauri-backed implementation in
// production and a synchronous mock in tests / browser dev mode.

import { useEffect, useState } from 'react';

export interface WikiPageListing {
  /** Forward-slash relative path under .beaver/wiki/. */
  path: string;
  /** First non-empty non-frontmatter line, with leading "# " trimmed. */
  title: string;
  /** Top-level dir under .beaver/wiki/ — "" for root files. The UI
   *  groups pages by section. */
  section: string;
  /** ISO 8601 string derived from the millisecond timestamp the
   *  Rust side reports. */
  modifiedAt: string;
  bytes: number;
}

export interface WikiPagesState {
  pages: readonly WikiPageListing[];
  /** Absolute path to the wiki directory for the "Open in file
   *  explorer" button. Empty when no workspace is selected. */
  wikiPath: string;
  /** True when .beaver/wiki/ exists. False when the workspace is
   *  fresh — the renderer shows an explanatory empty state. */
  exists: boolean;
  /** True only on the first poll. Subsequent reloads keep the
   *  previous list visible. */
  loading: boolean;
  /** Last error from the transport, or null. */
  error: string | null;
}

export interface WikiPagesTransport {
  /** One-shot fetch. Resolves the list (or rejects with a typed
   *  error). Tests inject a synchronous resolver; production wires
   *  this to the Tauri `wiki_list_pages` invoke. */
  list(): Promise<{ pages: readonly WikiPageListing[]; wikiPath: string; exists: boolean }>;
  /** Open the wiki dir in the OS file explorer. */
  reveal(): Promise<void>;
}

const INITIAL_STATE: WikiPagesState = {
  pages: [],
  wikiPath: '',
  exists: false,
  loading: true,
  error: null,
};

export function useWikiPages(transport: WikiPagesTransport): {
  state: WikiPagesState;
  reload: () => void;
  reveal: () => Promise<void>;
} {
  const [state, setState] = useState<WikiPagesState>(INITIAL_STATE);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    transport
      .list()
      .then((result) => {
        if (cancelled) return;
        setState({
          pages: result.pages,
          wikiPath: result.wikiPath,
          exists: result.exists,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [transport, tick]);

  return {
    state,
    reload: () => setTick((t) => t + 1),
    reveal: () => transport.reveal(),
  };
}
