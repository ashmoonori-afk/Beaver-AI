// v0.1.1-E — auto-update prompt banner.
//
// Displayed at the top of the app shell when a newer Beaver release
// is available. The actual download/install/restart cycle is driven
// by the `useUpdateCheck` hook; this component is presentational only.
//
// Phase 0 review-pass:
//  - role="region" + aria-label rather than role="status" with embedded
//    interactive buttons (status regions are advisory).
//  - aria-live="assertive" on the title so updates announce on first
//    appearance (a new version is important enough that users should
//    hear it immediately, not after the next polite-queue flush).
//  - Dismiss button stays enabled while download/restart is in flight
//    so keyboard users always have an escape hatch.

import type { UpdateState } from '../hooks/useUpdateCheck.js';

export interface UpdateBannerProps {
  state: UpdateState;
}

export function UpdateBanner({ state }: UpdateBannerProps) {
  if (!state.available) return null;

  const isBusy = state.status === 'downloading' || state.status === 'restarting';

  return (
    <div
      role="region"
      aria-label="Update available"
      className="mx-6 mt-3 flex items-start gap-3 rounded-card border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-emerald-50"
    >
      <div className="flex-1">
        <p className="text-body font-semibold" aria-live="assertive">
          Beaver {state.version ?? 'update'} is available
        </p>
        {state.notes ? (
          <p className="mt-1 line-clamp-3 text-caption opacity-90">{state.notes}</p>
        ) : (
          <p className="mt-1 text-caption opacity-90">
            Install now to get the latest fixes and features. Beaver will restart.
          </p>
        )}
        {state.error ? (
          <p className="mt-1 text-caption text-red-300" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          void state.apply();
        }}
        disabled={isBusy}
        className="rounded-card border border-current px-3 py-1 text-caption transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {state.status === 'downloading'
          ? 'Downloading…'
          : state.status === 'restarting'
            ? 'Restarting…'
            : 'Install & restart'}
      </button>
      {/* Dismiss stays enabled during busy states so keyboard users
          can always escape — even if relaunch hangs. */}
      <button
        type="button"
        onClick={state.dismiss}
        aria-label="Dismiss update notice"
        className="rounded-card px-2 py-1 text-caption opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        ×
      </button>
    </div>
  );
}
