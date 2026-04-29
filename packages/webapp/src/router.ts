// Tiny hash router (no library, per the locked stack). Maps
// `URL.hash` -> `Panel` name. Components subscribe via useCurrentPanel.

import { useEffect, useState } from 'react';

// v0.2 M3.5 — Wiki tab is hidden in v0.2 by default. The slot remains
// in the type union so the renderer can flip it on via a future flag
// or v0.2.x release; the App.tsx panel registry controls visibility.
export const ALL_PANELS = [
  'home',
  'status',
  'prd',
  'checkpoints',
  'plan',
  'logs',
  'review',
  'wiki',
] as const;
export type Panel = (typeof ALL_PANELS)[number];

const HIDE_WIKI_BY_DEFAULT = true;

export const PANELS: readonly Panel[] = HIDE_WIKI_BY_DEFAULT
  ? ALL_PANELS.filter((p) => p !== 'wiki')
  : ALL_PANELS;

export const DEFAULT_PANEL: Panel = 'home';

export function panelFromHash(hash: string): Panel {
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  // Accept any Panel literal (even hidden ones) so a power user can
  // navigate to e.g. #wiki via URL while the tab itself stays hidden.
  return (ALL_PANELS as readonly string[]).includes(stripped) ? (stripped as Panel) : DEFAULT_PANEL;
}

export function useCurrentPanel(): Panel {
  const [panel, setPanel] = useState<Panel>(() =>
    typeof window === 'undefined' ? DEFAULT_PANEL : panelFromHash(window.location.hash),
  );
  useEffect(() => {
    const handler = (): void => setPanel(panelFromHash(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return panel;
}

export function navigate(panel: Panel): void {
  if (typeof window === 'undefined') return;
  window.location.hash = panel;
}
