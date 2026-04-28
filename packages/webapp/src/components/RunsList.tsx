// UX-2 / UX-3 — run history sidebar.
//
// Renders a vertical list of every run in the active workspace, most
// recent first. Each row shows goal (truncated), status, started_at
// (relative). Clicking a row sets it as the active run so the existing
// status / plan / logs / checkpoints transports re-key onto it. UX-3:
// pending runs (eg. FINAL_REVIEW_PENDING) appear like any other entry
// so the user can come back and answer.

import type { RunHistoryItem } from '../hooks/useRunsList.js';

export interface RunsListProps {
  runs: RunHistoryItem[];
  activeRunId: string | null;
  onSelect: (runId: string) => void;
}

const STATUS_TONE: Record<string, string> = {
  COMPLETED: 'bg-emerald-900/40 text-emerald-200 border-emerald-700/40',
  FAILED: 'bg-red-900/40 text-red-200 border-red-700/40',
  ABORTED: 'bg-amber-900/40 text-amber-200 border-amber-700/40',
  FINAL_REVIEW_PENDING: 'bg-blue-900/40 text-blue-200 border-blue-700/40',
  REVIEWING: 'bg-blue-900/40 text-blue-200 border-blue-700/40',
  EXECUTING: 'bg-indigo-900/40 text-indigo-200 border-indigo-700/40',
  PLANNING: 'bg-indigo-900/40 text-indigo-200 border-indigo-700/40',
  REFINING_GOAL: 'bg-indigo-900/40 text-indigo-200 border-indigo-700/40',
  INITIALIZED: 'bg-surface-700 text-text-300 border-surface-600',
};

function relativeTime(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const delta = Math.max(0, Date.now() - ts);
  const m = Math.floor(delta / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function RunsList({ runs, activeRunId, onSelect }: RunsListProps) {
  if (runs.length === 0) {
    return (
      <p className="text-caption text-text-500" aria-label="No previous runs">
        No previous runs yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5" aria-label="Previous runs">
      {runs.map((r) => {
        const tone = STATUS_TONE[r.status] ?? STATUS_TONE['INITIALIZED']!;
        const isActive = r.id === activeRunId;
        const pendingReview = r.status === 'FINAL_REVIEW_PENDING' || r.status === 'REVIEWING';
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={`flex w-full flex-col gap-1 rounded-card border px-3 py-2 text-left transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                isActive
                  ? 'border-accent-500 bg-surface-800'
                  : 'border-transparent bg-surface-800/60'
              }`}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="line-clamp-2 text-body text-text-100">{r.goal}</span>
              <span className="flex items-center gap-2 text-caption text-text-500">
                <span className={`rounded border px-1.5 py-0.5 ${tone}`}>
                  {r.status.toLowerCase().replace(/_/g, ' ')}
                </span>
                <span>{relativeTime(r.startedAt)}</span>
                {pendingReview ? <span className="text-amber-300">• needs review</span> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
