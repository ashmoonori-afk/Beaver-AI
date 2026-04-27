// Confirmation modal for the destructive `discard` action on the
// #review panel. Esc + click-outside cancel; Enter inside the modal
// confirms. No portal — modal sits at the top of the panel tree, with
// a fixed backdrop that traps clicks via stopPropagation.

import { useEffect, useRef } from 'react';

const BTN =
  'inline-flex min-h-[44px] items-center justify-center rounded-card px-4 py-2 ' +
  'text-body font-medium transition-colors focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50';

export interface ConfirmDiscardModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDiscardModal({ onConfirm, onCancel }: ConfirmDiscardModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-discard-title"
      data-testid="confirm-discard-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/70"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md space-y-4 rounded-card bg-surface-800 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-discard-title" className="text-hero text-text-50">
          Discard run output?
        </h3>
        <p className="text-body text-text-300">
          Branches and the final report will be deleted. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={`${BTN} bg-surface-700 text-text-50 hover:bg-surface-600`}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`${BTN} bg-danger-500 text-text-50 hover:bg-danger-400`}
            onClick={onConfirm}
            aria-label="Confirm discard"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
