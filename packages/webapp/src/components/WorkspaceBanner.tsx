// W.12.7 — header chip + empty-state CTA showing the active workspace.
//
// Two surfaces:
//   - Header chip (compact): folder name + "Change…" affordance. Tooltip
//     shows the full path so users on long path systems can verify.
//   - Empty-state card: when `path` is null and the renderer is inside
//     the Tauri shell. The Status panel renders this in place of the
//     GoalBox so a fresh launch's first action is "pick a folder".

import { cn } from '../lib/utils.js';

export interface WorkspaceBannerProps {
  path: string | null;
  loading: boolean;
  error: string | null;
  onPick: () => void;
  /** Render variant. `chip` = compact for the header. `card` = full
   *  empty-state surface. */
  variant: 'chip' | 'card';
}

/** Short label for the path (last segment) used in the chip. */
function shortName(path: string): string {
  const segs = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return segs[segs.length - 1] ?? path;
}

export function WorkspaceBanner({ path, loading, error, onPick, variant }: WorkspaceBannerProps) {
  if (variant === 'chip') {
    if (loading) {
      return (
        <span className="inline-flex items-center gap-2 rounded-card bg-surface-800 px-2 py-1 text-caption text-text-500">
          loading…
        </span>
      );
    }
    if (!path) {
      return (
        <button
          type="button"
          onClick={onPick}
          className="inline-flex items-center gap-2 rounded-card bg-surface-800 px-2 py-1 text-caption text-text-300 transition-colors hover:bg-surface-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          aria-label="Pick a project folder"
        >
          <span aria-hidden>📂</span>
          <span>No project</span>
        </button>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-2 rounded-card bg-surface-800 px-2 py-1 text-caption text-text-300"
        title={path}
      >
        <span aria-hidden>📂</span>
        <span className="max-w-[14rem] truncate">{shortName(path)}</span>
        <button
          type="button"
          onClick={onPick}
          className="rounded text-text-500 underline-offset-2 transition-colors hover:text-text-50 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          aria-label="Change project folder"
        >
          Change…
        </button>
      </span>
    );
  }

  // review-pass v0.1: render a loading state for the card variant so
  // the user sees "loading workspace…" rather than the full picker
  // CTA flash during the cold-start workspace_get round-trip.
  if (loading) {
    return (
      <section
        className={cn(
          'mx-auto flex max-w-xl items-center justify-center gap-2 rounded-card bg-surface-800 p-6 text-text-300',
        )}
        aria-label="Loading workspace state"
      >
        Loading workspace…
      </section>
    );
  }

  return (
    <section
      className={cn(
        'mx-auto flex max-w-xl flex-col items-center gap-3 rounded-card bg-surface-800 p-6 text-center text-text-200',
      )}
      aria-label="No project folder selected"
    >
      <h2 className="text-hero text-text-50">Pick a folder, ship a thing</h2>
      <p className="text-body text-text-300">
        Pick any folder — empty or full of code, doesn't matter. Beaver creates a{' '}
        <code className="rounded bg-surface-900 px-1 py-0.5 text-text-50">.beaver/</code> directory
        there for its plans and audit log on the first run.
      </p>
      <button
        type="button"
        onClick={onPick}
        className="mt-2 inline-flex items-center gap-2 rounded-card bg-accent-500 px-4 py-2 text-body text-surface-900 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        Pick folder…
      </button>
      {error ? (
        <p className="mt-2 text-caption text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
