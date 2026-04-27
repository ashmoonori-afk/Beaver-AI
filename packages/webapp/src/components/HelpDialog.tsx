// `?` opens this dialog. Lists every documented shortcut. Esc closes.

import { useRef } from 'react';

import { ModalShell } from './ModalShell.js';
import { PRIMARY } from '../lib/buttonClasses.js';
import { SHORTCUTS, type ShortcutTarget } from '../hooks/useKeyboardShortcuts.js';

const TARGET_LABEL: Record<ShortcutTarget, string> = {
  status: 'Run / Status',
  checkpoints: 'Checkpoints',
  plan: 'Plan',
  logs: 'Logs',
  review: 'Review',
  wiki: 'Wiki',
  help: 'Open this help',
};

export interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <ModalShell
      titleId="help-dialog-title"
      onClose={onClose}
      initialFocusRef={closeRef}
      testId="help-dialog"
    >
      <h3 id="help-dialog-title" className="text-hero text-text-50">
        Keyboard shortcuts
      </h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
        {SHORTCUTS.map((s) => (
          <div key={s.key} className="contents">
            <dt className="font-mono text-text-50">
              {s.key === '?' ? 'Shift + /' : s.key.toUpperCase()}
            </dt>
            <dd className="text-text-300">{TARGET_LABEL[s.target]}</dd>
          </div>
        ))}
        <dt className="font-mono text-text-50">Esc</dt>
        <dd className="text-text-300">Close any dialog</dd>
      </dl>
      <div className="flex justify-end">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className={PRIMARY}
          aria-label="Close help dialog"
        >
          Got it
        </button>
      </div>
    </ModalShell>
  );
}
