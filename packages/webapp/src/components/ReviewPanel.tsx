// #review panel — hero card with branches + diff-stat sparklines + the
// final-report markdown (sanitized via react-markdown's default-no-html
// + rehype-sanitize). Two big actions: approve (emerald) / discard
// (rose, modal-confirmed). No `dangerouslySetInnerHTML`, no client git.

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { BranchPill } from './BranchPill.js';
import { ConfirmDiscardModal } from './ConfirmDiscardModal.js';
import type { BranchSummary, DiffStat, FinalReportSummary } from '../types.js';

const ACTION_BTN =
  'inline-flex min-h-[44px] items-center justify-center rounded-card px-5 py-2 ' +
  'text-body font-medium transition-colors focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50';

export interface ReviewPanelProps {
  report: FinalReportSummary | null;
  onDecide: (decision: 'approve' | 'discard') => Promise<void>;
}

export function ReviewPanel({ report, onDecide }: ReviewPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!report) {
    return (
      <section
        data-testid="review-panel"
        className="flex h-[calc(100vh-4rem)] items-center justify-center"
      >
        <p className="text-caption text-text-500">
          The orchestrator will surface a final report here once the run reaches review.
        </p>
      </section>
    );
  }

  const submit = async (decision: 'approve' | 'discard'): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await onDecide(decision);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'decide failed');
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <section data-testid="review-panel" className="mx-auto w-full max-w-3xl space-y-4 py-6">
      <article className="space-y-4 rounded-card bg-surface-800 px-6 py-5">
        <header className="flex flex-col gap-1">
          <span className="text-caption text-text-500">Final review</span>
          <h2 className="text-hero text-text-50">Run summary</h2>
        </header>
        <BranchList branches={report.branches} />
        <FinalReportMarkdown markdown={report.markdown} />
      </article>
      {error ? (
        <p role="alert" className="text-caption text-danger-500">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className={`${ACTION_BTN} bg-danger-500 text-text-50 hover:bg-danger-400`}
          onClick={() => setConfirming(true)}
          disabled={busy}
          aria-label="Discard run output"
        >
          Discard
        </button>
        <button
          type="button"
          className={`${ACTION_BTN} bg-accent-500 text-surface-900 hover:bg-accent-400`}
          onClick={() => void submit('approve')}
          disabled={busy}
          aria-label="Approve and ship"
        >
          Approve
        </button>
      </div>
      {confirming ? (
        <ConfirmDiscardModal
          onConfirm={() => void submit('discard')}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </section>
  );
}

function BranchList({ branches }: { branches: readonly BranchSummary[] }) {
  if (branches.length === 0) {
    return <p className="text-caption text-text-500">No branches produced.</p>;
  }
  return (
    <ul data-testid="branch-list" className="space-y-2">
      {branches.map((b) => (
        <li key={b.ref} className="flex flex-wrap items-center gap-3">
          <BranchPill branch={b.ref} />
          <span className="text-caption text-text-500 font-mono">{b.agentRole}</span>
          <DiffStatSparkline diff={b.diff} />
        </li>
      ))}
    </ul>
  );
}

function DiffStatSparkline({ diff }: { diff: DiffStat }) {
  return (
    <span
      data-testid="diff-sparkline"
      aria-label={`${diff.filesChanged} files, +${diff.insertions}/-${diff.deletions}`}
      className="text-caption font-mono"
    >
      <span className="text-text-500">{diff.filesChanged} files </span>
      <span className="text-accent-500">+{diff.insertions}</span>
      <span className="text-text-500"> / </span>
      <span className="text-danger-500">-{diff.deletions}</span>
    </span>
  );
}

function FinalReportMarkdown({ markdown }: { markdown: string }) {
  // react-markdown disables raw HTML by default; rehype-sanitize runs
  // an additional pass so any future "allow HTML" toggles still get
  // sanitized. Result: no innerHTML escape hatch reaches the DOM.
  return (
    <div
      data-testid="final-report-md"
      className="prose prose-invert max-w-none text-body text-text-300"
    >
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
    </div>
  );
}
