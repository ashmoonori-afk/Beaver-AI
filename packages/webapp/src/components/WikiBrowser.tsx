// Phase 2-C — read-only browse view for the wiki. Lists pages
// grouped by section (root, decisions, projects, patterns, …) sorted
// by recent edits. Editing happens in the user's preferred markdown
// editor via the "Open in file explorer" button — we deliberately
// don't ship an in-app editor in v0.1.x.

import { useMemo, useState } from 'react';

import type { WikiPageListing, WikiPagesTransport } from '../hooks/useWikiPages.js';
import { useWikiPages } from '../hooks/useWikiPages.js';

export interface WikiBrowserProps {
  transport: WikiPagesTransport;
}

interface Section {
  key: string;
  label: string;
  pages: readonly WikiPageListing[];
}

const SECTION_LABEL: Record<string, string> = {
  '': 'Top level',
  decisions: 'Decisions',
  projects: 'Projects',
  patterns: 'Patterns',
};

function labelFor(section: string): string {
  return SECTION_LABEL[section] ?? section;
}

function groupBySection(pages: readonly WikiPageListing[]): Section[] {
  const buckets = new Map<string, WikiPageListing[]>();
  for (const p of pages) {
    if (!buckets.has(p.section)) buckets.set(p.section, []);
    buckets.get(p.section)!.push(p);
  }
  // Stable section order: root first, then known sections alphabetically,
  // then anything else alphabetically.
  const known = ['', 'decisions', 'projects', 'patterns'];
  const sorted: Section[] = [];
  for (const k of known) {
    const list = buckets.get(k);
    if (list && list.length > 0) {
      sorted.push({ key: k, label: labelFor(k), pages: list });
      buckets.delete(k);
    }
  }
  for (const [k, list] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    sorted.push({ key: k, label: labelFor(k), pages: list });
  }
  return sorted;
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const deltaMs = Date.now() - t;
  const sec = Math.round(deltaMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

export function WikiBrowser({ transport }: WikiBrowserProps) {
  const { state, reload, reveal } = useWikiPages(transport);
  const [revealing, setRevealing] = useState<boolean>(false);
  const sections = useMemo(() => groupBySection(state.pages), [state.pages]);

  const handleReveal = async (): Promise<void> => {
    setRevealing(true);
    try {
      await reveal();
    } finally {
      setRevealing(false);
    }
  };

  if (state.loading) {
    return (
      <p
        data-testid="wiki-browser-loading"
        className="text-caption text-text-500"
        aria-live="polite"
      >
        Loading wiki pages…
      </p>
    );
  }

  if (state.error) {
    return (
      <p role="alert" data-testid="wiki-browser-error" className="text-caption text-danger-500">
        Couldn't list wiki pages: {state.error}
      </p>
    );
  }

  if (!state.exists) {
    return (
      <section
        data-testid="wiki-browser-empty"
        className="rounded-card border border-surface-700 bg-surface-800 p-4 text-caption text-text-400"
      >
        <p className="text-body text-text-50">No wiki yet.</p>
        <p className="mt-1">
          Beaver writes to <span className="font-mono">.beaver/wiki/</span> after each run finishes.
          Run something and come back.
        </p>
        <button
          type="button"
          onClick={() => {
            void handleReveal();
          }}
          disabled={revealing}
          className="mt-3 inline-flex items-center gap-1.5 rounded-card bg-surface-700 px-3 py-1.5 text-caption text-text-50 transition-colors hover:bg-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Open wiki folder
        </button>
      </section>
    );
  }

  if (state.pages.length === 0) {
    return (
      <section
        data-testid="wiki-browser-no-pages"
        className="rounded-card border border-surface-700 bg-surface-800 p-4 text-caption text-text-400"
      >
        <p className="text-body text-text-50">The wiki folder exists but is empty.</p>
        <button
          type="button"
          onClick={() => {
            void handleReveal();
          }}
          disabled={revealing}
          className="mt-3 inline-flex items-center gap-1.5 rounded-card bg-surface-700 px-3 py-1.5 text-caption text-text-50 transition-colors hover:bg-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Open wiki folder
        </button>
      </section>
    );
  }

  return (
    <section data-testid="wiki-browser" aria-label="Wiki page browser" className="space-y-4">
      <header className="flex items-center justify-between">
        <p className="text-caption text-text-500">
          {state.pages.length} page{state.pages.length === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={reload}
            className="rounded-card bg-surface-800 px-3 py-1 text-caption text-text-300 transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => {
              void handleReveal();
            }}
            disabled={revealing}
            className="rounded-card bg-accent-500 px-3 py-1 text-caption text-surface-900 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open folder
          </button>
        </div>
      </header>
      <ul className="space-y-4">
        {sections.map((section) => (
          <li key={section.key} data-testid={`wiki-section-${section.key || 'root'}`}>
            <h3 className="mb-1 text-caption uppercase tracking-wide text-text-500">
              {section.label}
            </h3>
            <ul className="space-y-1">
              {section.pages.map((page) => (
                <li
                  key={page.path}
                  data-testid={`wiki-page-${page.path}`}
                  className="rounded-card bg-surface-800 px-3 py-2 hover:bg-surface-700"
                >
                  <p className="text-body text-text-50">{page.title}</p>
                  <p className="mt-0.5 text-caption text-text-500">
                    <span className="font-mono">{page.path}</span>
                    <span className="mx-2 opacity-50">·</span>
                    <span>{formatRelative(page.modifiedAt)}</span>
                    <span className="mx-2 opacity-50">·</span>
                    <span>{page.bytes} bytes</span>
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const __test__ = { groupBySection, formatRelative, labelFor };
