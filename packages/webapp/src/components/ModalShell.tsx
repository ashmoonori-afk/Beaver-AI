// Reusable backdrop + Esc + click-outside + focus shell for modals.
// Kills the boilerplate that ConfirmDiscardModal and HelpDialog were
// otherwise duplicating verbatim. Caller passes `titleId` so the
// matching <h?> in `children` can supply the accessible name.

import { useEffect, useRef, type ReactNode } from 'react';

export interface ModalShellProps {
  /** id of the heading element inside `children` — wired to aria-labelledby. */
  titleId: string;
  /** Cancel/close handler — fires on Esc, backdrop click, or any
   *  consumer that wires it to a button inside `children`. */
  onClose: () => void;
  /** Optional element to autofocus on mount. Defaults to the modal
   *  body itself if omitted. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Test seam — defaults to a unique id per call site. */
  testId?: string;
  children: ReactNode;
}

export function ModalShell({
  titleId,
  onClose,
  initialFocusRef,
  testId,
  children,
}: ModalShellProps) {
  const fallbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = initialFocusRef?.current ?? fallbackRef.current;
    target?.focus();
  }, [initialFocusRef]);

  useEffect(() => {
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
      aria-labelledby={titleId}
      data-testid={testId}
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/70"
      onClick={onClose}
    >
      <div
        ref={fallbackRef}
        tabIndex={-1}
        className="w-full max-w-md space-y-4 rounded-card bg-surface-800 p-6 focus:outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
