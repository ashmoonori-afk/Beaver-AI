// Phase 3-C — animated placeholder primitives. Two shapes cover
// every loading affordance v0.1.x renders today:
//   - <SkeletonLine />    — a single text-row placeholder.
//   - <SkeletonBlock />   — a rectangle for cards / images.
// Both pulse via Tailwind's `animate-pulse`. Any consumer that
// needs a multi-line block just stacks <SkeletonLine /> in a flex
// column.

import { cn } from '../lib/utils.js';

export interface SkeletonLineProps {
  /** Tailwind width class — defaults to w-full. Pass e.g. `w-3/4`
   *  to vary line lengths so the placeholder looks like text. */
  width?: string;
  className?: string;
}

export function SkeletonLine({ width = 'w-full', className }: SkeletonLineProps) {
  return (
    <span
      data-testid="skeleton-line"
      aria-hidden
      className={cn('block h-3 animate-pulse rounded bg-surface-700', width, className)}
    />
  );
}

export interface SkeletonBlockProps {
  className?: string;
}

export function SkeletonBlock({ className }: SkeletonBlockProps) {
  return (
    <div
      data-testid="skeleton-block"
      aria-hidden
      className={cn('animate-pulse rounded-card bg-surface-700', className)}
    />
  );
}

/** Convenience: 3-line stub the renderer can drop in any text slot
 *  (cards, list items, panel bodies) when the data is loading. */
export function SkeletonParagraph() {
  return (
    <div data-testid="skeleton-paragraph" className="flex flex-col gap-2">
      <SkeletonLine width="w-3/4" />
      <SkeletonLine width="w-5/6" />
      <SkeletonLine width="w-2/3" />
    </div>
  );
}
