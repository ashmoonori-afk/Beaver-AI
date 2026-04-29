// Global keyboard shortcuts. Bound to window keydown so they fire from
// anywhere except inside text inputs (4U.6 polish: typing shouldn't
// navigate). The handler list is data — there's no `if (key === 'r')`
// cascade, so adding a shortcut is one row.
//
// Phase 3-D — bindings can opt into a `modifier: 'cmd-or-ctrl'` so
// they fire even while a text input has focus (e.g. `Cmd/Ctrl+K`
// jumps to the wiki without first clicking out of the goal box).

import { useEffect } from 'react';

import type { Panel } from '../router.js';
import { navigate } from '../router.js';

export type ShortcutTarget = Panel | 'help';
export type ShortcutModifier = 'cmd-or-ctrl';

export interface ShortcutBinding {
  key: string;
  target: ShortcutTarget;
  /** When set, the shortcut requires this modifier and bypasses the
   *  "skip while typing" rule. Bindings with no modifier are the
   *  legacy single-key navigation shortcuts. */
  modifier?: ShortcutModifier;
}

export const SHORTCUTS: readonly ShortcutBinding[] = [
  { key: 'r', target: 'status' },
  { key: 'c', target: 'checkpoints' },
  { key: 'p', target: 'plan' },
  { key: 'l', target: 'logs' },
  { key: 'v', target: 'review' },
  { key: 'w', target: 'wiki' },
  { key: '?', target: 'help' },
  // Phase 3-D — universal "search / wiki" shortcut. Works even from
  // inside the goal box or any other text input.
  { key: 'k', target: 'wiki', modifier: 'cmd-or-ctrl' },
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

function modifierMatches(e: KeyboardEvent, mod: ShortcutModifier | undefined): boolean {
  if (mod === 'cmd-or-ctrl') {
    // Treat Meta (mac) and Ctrl (windows/linux) interchangeably so a
    // single binding works on every host. Alt is rejected because
    // it changes the keyCode shape.
    return (e.metaKey || e.ctrlKey) && !e.altKey;
  }
  // No modifier: nothing else may be held.
  return !e.metaKey && !e.ctrlKey && !e.altKey;
}

export function useKeyboardShortcuts({ onHelp }: UseKeyboardShortcutsOptions): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const binding = SHORTCUTS.find((s) => s.key === e.key && modifierMatches(e, s.modifier));
      if (!binding) return;
      // Plain bindings only fire outside text inputs (typing shouldn't
      // navigate). Modifier bindings bypass that — Cmd+K is supposed
      // to work even while typing.
      if (!binding.modifier && isInsideTextInput(e.target)) return;
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
