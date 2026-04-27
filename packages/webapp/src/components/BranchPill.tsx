// `beaver/<run>/<agent>` pill with copy-on-click. Falls back to a
// no-op when navigator.clipboard is unavailable (e.g. older test
// environments) so the click handler never throws.

import { useCallback, useState } from 'react';

import { cn } from '../lib/utils.js';

export interface BranchPillProps {
  /** Branch ref to render and copy on click. Named `branch` (not `ref`)
   *  because `ref` is a reserved React prop. */
  branch: string;
}

export function BranchPill({ branch }: BranchPillProps) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(async () => {
    const clip = (
      globalThis as {
        navigator?: { clipboard?: { writeText: (s: string) => Promise<void> } };
      }
    ).navigator?.clipboard;
    if (clip) {
      try {
        await clip.writeText(branch);
      } catch {
        // ignore — secure-context restriction in the test harness.
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [branch]);

  return (
    <button
      type="button"
      data-testid={`branch-pill-${branch}`}
      onClick={() => void onClick()}
      aria-label={`Copy branch name ${branch}`}
      className={cn(
        'inline-flex items-center gap-2 rounded-card px-3 py-1 font-mono text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        copied
          ? 'bg-accent-500 text-surface-900'
          : 'bg-surface-800 text-text-300 hover:bg-surface-700',
      )}
    >
      <span>{branch}</span>
      <span aria-hidden className="text-text-500">
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}
