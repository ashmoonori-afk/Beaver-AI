// Virtualized live log list for the LivePane. v0.2 M3.3.
//
// Uses @tanstack/react-virtual (already in webapp deps) to keep
// rendering smooth under thousands of lines. Auto-scrolls to the
// bottom when the user is already at the tail; otherwise stays put
// so a user reading mid-scroll isn't yanked away.

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { LogLine } from '../hooks/useLogLines.js';

export interface LiveLogListProps {
  lines: LogLine[];
}

const ROW_HEIGHT = 18;

export function LiveLogList({ lines }: LiveLogListProps) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef<boolean>(true);

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Sticky-tail behaviour: track whether the user has scrolled away
  // from the bottom; auto-scroll only when they haven't.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return undefined;
    const onScroll = (): void => {
      const fromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
      stickToBottomRef.current = fromBottom < 24;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    if (lines.length === 0) return;
    virtualizer.scrollToIndex(lines.length - 1, { align: 'end' });
  }, [lines.length, virtualizer]);

  if (lines.length === 0) {
    return (
      <p className="text-caption text-text-500" data-testid="live-log-empty">
        No log lines yet — the coder hasn&rsquo;t started, or this build doesn&rsquo;t emit
        line-by-line stdout.
      </p>
    );
  }

  return (
    <div
      ref={parentRef}
      data-testid="live-log-list"
      className="h-64 w-full overflow-auto rounded bg-surface-900 px-2 py-1 font-mono text-caption text-text-300"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((vRow) => {
          const line = lines[vRow.index];
          if (!line) return null;
          return (
            <div
              key={vRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: vRow.size,
                transform: `translateY(${vRow.start}px)`,
              }}
              className={line.stream === 'stderr' ? 'text-danger-400' : ''}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}
