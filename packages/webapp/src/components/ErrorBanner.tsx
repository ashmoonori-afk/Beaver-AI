// W.12.8 — error banner displayed at the top of the App shell.
//
// Surfaces classified errors (cli-missing, network, quota, api-key, …)
// with a one-line title, a short explanation, and an optional CTA.
// Dismiss closes the banner; consumers re-mount it on the next failure.

import { useCallback } from 'react';

import type { ClassifiedError } from '../lib/errorMessages.js';

export interface ErrorBannerProps {
  error: ClassifiedError;
  /** Wired by the caller; ErrorBanner doesn't know what 'pick-workspace'
   *  or 'retry' mean in the surrounding app state. */
  onAction?: (
    intent: ClassifiedError['action'] extends infer A
      ? A extends { intent: infer I }
        ? I
        : never
      : never,
  ) => void;
  onDismiss: () => void;
}

const TONE_BY_KIND: Record<ClassifiedError['kind'], string> = {
  'cli-missing': 'border-amber-500/40 bg-amber-950/40 text-amber-50',
  network: 'border-amber-500/40 bg-amber-950/40 text-amber-50',
  quota: 'border-amber-500/40 bg-amber-950/40 text-amber-50',
  'api-key': 'border-amber-500/40 bg-amber-950/40 text-amber-50',
  'workspace-missing': 'border-blue-500/40 bg-blue-950/40 text-blue-50',
  'workspace-invalid': 'border-blue-500/40 bg-blue-950/40 text-blue-50',
  'goal-empty': 'border-surface-600 bg-surface-800 text-text-100',
  generic: 'border-red-500/40 bg-red-950/40 text-red-50',
};

export function ErrorBanner({ error, onAction, onDismiss }: ErrorBannerProps) {
  const tone = TONE_BY_KIND[error.kind];
  const handleAction = useCallback(() => {
    if (error.action && onAction) onAction(error.action.intent);
    if (error.action?.intent === 'open-docs' && error.action.href) {
      // window.open is fine in both Tauri webview and browser dev mode.
      window.open(error.action.href, '_blank', 'noopener');
    }
  }, [error, onAction]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`mx-6 mt-3 flex items-start gap-3 rounded-card border px-4 py-3 ${tone}`}
    >
      <div className="flex-1">
        <p className="text-body font-semibold">{error.title}</p>
        <p className="mt-1 text-caption opacity-90">{error.body}</p>
      </div>
      {error.action ? (
        <button
          type="button"
          onClick={handleAction}
          className="rounded-card border border-current px-3 py-1 text-caption transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {error.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss error"
        className="rounded-card px-2 py-1 text-caption opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      >
        ×
      </button>
    </div>
  );
}
