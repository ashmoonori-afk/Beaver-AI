// `?` opens this dialog. Lists every documented shortcut. Esc closes.

import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-dialog-title"
      data-testid="help-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-card bg-surface-800 p-6"
        onClick={(e) => e.stopPropagation()}
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
            className="inline-flex min-h-[44px] items-center justify-center rounded-card bg-accent-500 px-4 py-2 text-body font-medium text-surface-900 transition-colors hover:bg-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-800"
            aria-label="Close help dialog"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
