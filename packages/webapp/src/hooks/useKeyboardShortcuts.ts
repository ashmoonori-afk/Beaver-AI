// Global keyboard shortcuts. Bound to window keydown so they fire from
// anywhere except inside text inputs (4U.6 polish: typing shouldn't
// navigate). The handler list is data — there's no `if (key === 'r')`
// cascade, so adding a shortcut is one row.

import { useEffect } from 'react';

import type { Panel } from '../router.js';
import { navigate } from '../router.js';

export type ShortcutTarget = Panel | 'help';

export interface ShortcutBinding {
  key: string;
  target: ShortcutTarget;
}

export const SHORTCUTS: readonly ShortcutBinding[] = [
  { key: 'r', target: 'status' },
  { key: 'c', target: 'checkpoints' },
  { key: 'p', target: 'plan' },
  { key: 'l', target: 'logs' },
  { key: 'v', target: 'review' },
  { key: 'w', target: 'wiki' },
  { key: '?', target: 'help' },
];

function isInsideTextInput(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return true;
  return false;
}

export interface UseKeyboardShortcutsOptions {
  onHelp: () => void;
}

export function useKeyboardShortcuts({ onHelp }: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isInsideTextInput(e.target)) return;
      const binding = SHORTCUTS.find((s) => s.key === e.key);
      if (!binding) return;
      e.preventDefault();
      if (binding.target === 'help') {
        onHelp();
      } else {
        navigate(binding.target);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onHelp]);
}
