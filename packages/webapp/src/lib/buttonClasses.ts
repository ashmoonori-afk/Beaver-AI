// Single source of truth for the button class strings used across
// every interactive surface. 4U.6 review-gate guarantees a 44 px hit
// area + visible focus ring on every button — codifying it here means
// new dialogs / actions can't silently drift out of compliance.

const BTN_BASE =
  'inline-flex min-h-[44px] items-center justify-center rounded-card px-4 py-2 ' +
  'text-body font-medium transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-surface-800 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export const PRIMARY = `${BTN_BASE} bg-accent-500 text-surface-900 hover:bg-accent-400`;
export const SECONDARY = `${BTN_BASE} bg-surface-700 text-text-50 hover:bg-surface-600`;
export const DESTRUCTIVE = `${BTN_BASE} bg-danger-500 text-text-50 hover:bg-danger-400`;
