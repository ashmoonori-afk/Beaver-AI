// Phase 2-C — top-level wiki panel. Splits the existing Q&A surface
// (WikiSearch) and the new browse view (WikiBrowser) behind a simple
// tab bar so users can pick between "ask the wiki" and "see what's
// in it." Editing happens via the OS file explorer (Open folder
// button on the Browse tab) — no in-app editor in v0.1.x.

import { useState } from 'react';

import type { AskWikiTransport } from '../hooks/useAskWiki.js';
import type { WikiPagesTransport } from '../hooks/useWikiPages.js';
import { WikiBrowser } from './WikiBrowser.js';
import { WikiSearch } from './WikiSearch.js';

type Tab = 'ask' | 'browse';

export interface WikiPanelProps {
  askTransport: AskWikiTransport;
  pagesTransport: WikiPagesTransport;
  /** Test seam — same shape as WikiSearch's debounce override. */
  debounceMs?: number;
  /** Initial tab — defaults to 'ask' so the existing Q&A is the
   *  landing surface. */
  initialTab?: Tab;
}

export function WikiPanel({
  askTransport,
  pagesTransport,
  debounceMs,
  initialTab,
}: WikiPanelProps) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'ask');
  return (
    <section data-testid="wiki-panel-shell" className="mx-auto w-full max-w-3xl space-y-4 py-6">
      <div role="tablist" aria-label="Wiki tabs" className="flex gap-2 border-b border-surface-700">
        <TabButton current={tab} value="ask" onClick={setTab}>
          Ask
        </TabButton>
        <TabButton current={tab} value="browse" onClick={setTab}>
          Browse
        </TabButton>
      </div>
      <div data-testid={`wiki-panel-${tab}`}>
        {tab === 'ask' ? (
          <WikiSearch
            transport={askTransport}
            {...(debounceMs !== undefined ? { debounceMs } : {})}
          />
        ) : (
          <WikiBrowser transport={pagesTransport} />
        )}
      </div>
    </section>
  );
}

function TabButton({
  current,
  value,
  onClick,
  children,
}: {
  current: Tab;
  value: Tab;
  onClick: (next: Tab) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => onClick(value)}
      className={
        active
          ? 'border-b-2 border-accent-500 px-3 py-1.5 text-body text-text-50'
          : 'border-b-2 border-transparent px-3 py-1.5 text-body text-text-300 hover:text-text-50'
      }
    >
      {children}
    </button>
  );
}
