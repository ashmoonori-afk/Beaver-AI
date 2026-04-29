// Phase 1-B — unified-diff viewer.
//
// Shows the output of `git diff HEAD` in a compact, syntax-coloured
// list. Plain HTML rendering (no third-party syntax-highlighter) so
// the UI stays small and the lovable-feeling responsiveness lands —
// each line is one DOM node with one of four classes.

import { useMemo } from 'react';

import { cn } from '../lib/utils.js';

export type DiffStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DiffViewerProps {
  status: DiffStatus;
  diff?: string;
  errorMessage?: string;
  /** Optional callback so consumers can request a refresh (e.g. after
   *  a run completes). When omitted the empty state has no CTA. */
  onRefresh?: () => void;
}

interface ParsedLine {
  kind: 'add' | 'remove' | 'header' | 'meta' | 'context';
  text: string;
}

function classify(line: string): ParsedLine['kind'] {
  if (line.startsWith('+++') || line.startsWith('---')) return 'header';
  if (line.startsWith('@@')) return 'meta';
  if (line.startsWith('diff --git') || line.startsWith('index ')) return 'meta';
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  return 'context';
}

const LINE_CLASS: Record<ParsedLine['kind'], string> = {
  add: 'bg-emerald-950/40 text-emerald-200',
  remove: 'bg-red-950/40 text-red-200',
  header: 'bg-surface-800 text-text-50 font-semibold',
  meta: 'text-text-500',
  context: 'text-text-300',
};

export function DiffViewer({ status, diff, errorMessage, onRefresh }: DiffViewerProps) {
  const lines = useMemo<ParsedLine[]>(() => {
    if (!diff) return [];
    return diff.split('\n').map((text) => ({ kind: classify(text), text }));
  }, [diff]);

  if (status === 'idle') {
    return (
      <section
        className="rounded-card border border-surface-700 bg-surface-800 p-4 text-center text-text-400"
        aria-label="Workspace diff"
      >
        <p>No diff loaded yet.</p>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="mt-2 inline-flex items-center gap-1 rounded-card bg-surface-700 px-3 py-1 text-caption text-text-100 hover:bg-surface-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            Show changes
          </button>
        ) : null}
      </section>
    );
  }

  if (status === 'loading') {
    return (
      <section
        className="rounded-card border border-surface-700 bg-surface-800 p-4 text-center text-text-400"
        aria-label="Workspace diff"
        aria-busy
      >
        Loading diff…
      </section>
    );
  }

  if (status === 'error') {
    return (
      <section
        className="rounded-card border border-red-500/40 bg-red-950/30 p-4 text-red-200"
        role="alert"
      >
        <p className="text-body font-semibold">Couldn't load the diff</p>
        <p className="mt-1 text-caption opacity-90">
          {errorMessage ?? 'git diff returned an unknown error.'}
        </p>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="mt-2 inline-flex items-center gap-1 rounded-card border border-current px-3 py-1 text-caption hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            Retry
          </button>
        ) : null}
      </section>
    );
  }

  if (lines.length === 0 || (diff ?? '').trim().length === 0) {
    return (
      <section
        className="rounded-card border border-surface-700 bg-surface-800 p-4 text-center text-text-400"
        aria-label="Workspace diff"
      >
        <p>No changes since last commit.</p>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-card border border-surface-700 bg-surface-900"
      aria-label="Workspace diff"
    >
      <div className="flex items-center justify-between border-b border-surface-700 bg-surface-800 px-3 py-1.5">
        <span className="text-caption text-text-400">
          {lines.length} line{lines.length === 1 ? '' : 's'}
        </span>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            className="text-caption text-text-400 hover:text-text-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            Refresh
          </button>
        ) : null}
      </div>
      <pre className="max-h-[480px] overflow-auto p-0 font-mono text-caption">
        {lines.map((l, i) => (
          <div key={i} className={cn('whitespace-pre px-3', LINE_CLASS[l.kind])}>
            {l.text || ' '}
          </div>
        ))}
      </pre>
    </section>
  );
}
