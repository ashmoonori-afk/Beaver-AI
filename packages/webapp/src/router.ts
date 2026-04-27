// Tiny hash router (no library, per the locked stack). Maps
// `URL.hash` -> `Panel` name. Components subscribe via useCurrentPanel.

import { useEffect, useState } from 'react';

export const PANELS = ['status', 'checkpoints', 'plan', 'logs', 'review', 'wiki'] as const;
export type Panel = (typeof PANELS)[number];

export const DEFAULT_PANEL: Panel = 'status';

export function panelFromHash(hash: string): Panel {
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  return (PANELS as readonly string[]).includes(stripped) ? (stripped as Panel) : DEFAULT_PANEL;
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
