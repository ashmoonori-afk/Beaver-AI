// Confirmation modal for the destructive `discard` action on the
// #review panel. Shell + button classes are shared via ModalShell +
// buttonClasses so the focus-ring + min-height invariants are enforced
// in one place.

import { useRef } from 'react';

import { ModalShell } from './ModalShell.js';
import { DESTRUCTIVE, SECONDARY } from '../lib/buttonClasses.js';

export interface ConfirmDiscardModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  /** True while the parent's discard call is in flight — disables
   *  the Confirm button so a second click can't issue a duplicate
   *  request before the first resolves. */
  busy?: boolean;
}

export function ConfirmDiscardModal({ onConfirm, onCancel, busy }: ConfirmDiscardModalProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalShell
      titleId="confirm-discard-title"
      onClose={onCancel}
      initialFocusRef={confirmRef}
      testId="confirm-discard-modal"
    >
      <h3 id="confirm-discard-title" className="text-hero text-text-50">
        Discard run output?
      </h3>
      <p className="text-body text-text-300">
        Branches and the final report will be deleted. This action cannot be undone.
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" className={SECONDARY} onClick={onCancel}>
          Cancel
        </button>
        <button
          ref={confirmRef}
          type="button"
          className={DESTRUCTIVE}
          onClick={onConfirm}
          disabled={busy}
          aria-label="Confirm discard"
        >
          Discard
        </button>
      </div>
    </ModalShell>
  );
}
