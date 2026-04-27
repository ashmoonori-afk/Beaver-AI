// GoalBox — the "Lovable moment" of Beaver's UI.
//
// One oversized centered textarea. Empty-state copy primes the user.
// Cmd/Ctrl+Enter submits without losing the line break the user might
// be in the middle of. Plain Enter only adds a newline (so multi-line
// goals are natural).
//
// Auto-grows up to a max height; a vertical scroll only kicks in past
// that. Focus-on-mount lets the user just start typing the moment the
// app opens.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { cn } from '../lib/utils.js';

const MAX_HEIGHT_PX = 480;

export interface GoalBoxProps {
  /** Called once with the trimmed goal when the user submits. */
  onSubmit: (goal: string) => void;
  /** Visually-hidden override for the placeholder copy. */
  placeholder?: string;
  /** Disable submission while a run is being created upstream. */
  disabled?: boolean;
}

export function GoalBox({
  onSubmit,
  placeholder = "Describe what you'd like Beaver to build…",
  disabled = false,
}: GoalBoxProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    ref.current?.focus();
  }, []);

  // Auto-resize.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function trySubmit(): void {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    // Cmd+Enter (mac) or Ctrl+Enter (win/linux). Plain Enter falls
    // through to the textarea's own newline behavior.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      trySubmit();
    }
  }

  return (
    <div
      data-testid="goalbox"
      className="mx-auto flex w-full max-w-3xl flex-col items-stretch gap-3 transition-opacity"
      style={{ animation: 'goalbox-in 200ms cubic-bezier(0.16, 1, 0.3, 1)' }}
    >
      <p className="text-text-300 text-caption">Beaver is idle. What should we build?</p>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={3}
        disabled={disabled}
        aria-label="Goal description"
        className={cn(
          'w-full resize-none overflow-y-auto rounded-card bg-surface-800 px-5 py-4',
          'text-hero text-text-50 placeholder:text-text-500',
          'border border-surface-700 focus:border-accent-500 focus:outline-none',
          'transition-colors',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      />
      <div className="flex items-center justify-between text-caption text-text-500">
        <span>
          <kbd className="rounded bg-surface-800 px-1.5 py-0.5 font-mono">Cmd</kbd>
          <span className="mx-1">/</span>
          <kbd className="rounded bg-surface-800 px-1.5 py-0.5 font-mono">Ctrl</kbd>
          <span className="ml-1">+</span>
          <kbd className="ml-1 rounded bg-surface-800 px-1.5 py-0.5 font-mono">Enter</kbd>
          <span className="ml-2">to run</span>
        </span>
        <button
          type="button"
          disabled={disabled || value.trim().length === 0}
          onClick={trySubmit}
          className={cn(
            'rounded-card px-4 py-1.5 text-caption font-medium transition-colors',
            'bg-accent-500 text-surface-900 hover:bg-accent-400',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          Run
        </button>
      </div>
    </div>
  );
}
