// #logs panel — virtualized event list (via @tanstack/react-virtual)
// + filter chips above + a `--json` toggle that pipes raw NDJSON into a
// code block. Smooth at 10 000+ events because virtualizer renders only
// the visible window.

import { useEffect, useRef, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { cn } from '../lib/utils.js';
import type { LogEvent, LogEventLevel } from '../types.js';

const LEVEL_FILTERS: ReadonlyArray<{ value: LogEventLevel | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
  { value: 'debug', label: 'Debug' },
];

const LEVEL_TEXT: Record<LogEventLevel, string> = {
  info: 'text-text-300',
  warn: 'text-accent-400',
  error: 'text-danger-500',
  debug: 'text-text-500',
};

export interface LogsPanelProps {
  events: readonly LogEvent[];
}

export function LogsPanel({ events }: LogsPanelProps) {
  const [filter, setFilter] = useState<LogEventLevel | 'all'>('all');
  const [showJson, setShowJson] = useState(false);
  const filtered = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.level === filter)),
    [events, filter],
  );

  return (
    <section data-testid="logs-panel" className="mx-auto w-full max-w-5xl space-y-3 py-4">
      <header className="flex flex-wrap items-center gap-3">
        <FilterChips value={filter} onChange={setFilter} />
        <label className="ml-auto flex items-center gap-2 text-caption text-text-500">
          <input
            type="checkbox"
            checked={showJson}
            onChange={(e) => setShowJson(e.target.checked)}
            aria-label="Show raw JSON"
          />
          <span>--json</span>
        </label>
      </header>
      {showJson ? <RawJsonBlock events={filtered} /> : <VirtualEventList events={filtered} />}
    </section>
  );
}

interface FilterChipsProps {
  value: LogEventLevel | 'all';
  onChange: (v: LogEventLevel | 'all') => void;
}

function FilterChips({ value, onChange }: FilterChipsProps) {
  return (
    <div role="group" aria-label="Log level filter" className="flex flex-wrap gap-1">
      {LEVEL_FILTERS.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onChange(f.value)}
          aria-pressed={value === f.value}
          className={cn(
            'min-h-[36px] rounded-card px-3 py-1 text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
            value === f.value
              ? 'bg-accent-500 text-surface-900'
              : 'bg-surface-800 text-text-300 hover:bg-surface-700',
          )}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

const ROW_HEIGHT = 28;

function VirtualEventList({ events }: { events: readonly LogEvent[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // Reset scroll on filter change so a deep scrollTop doesn't outrun
  // the new (potentially much shorter) totalSize and render a blank
  // pane — known TanStack Virtual behavior.
  useEffect(() => {
    if (parentRef.current) parentRef.current.scrollTop = 0;
  }, [events]);

  if (events.length === 0) {
    return (
      <p data-testid="logs-empty" className="text-caption text-text-500">
        No events match the current filter.
      </p>
    );
  }

  return (
    <div
      ref={parentRef}
      data-testid="logs-scroll"
      aria-live="polite"
      className="h-[60vh] overflow-auto rounded-card bg-surface-800 px-3 py-2"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const ev = events[vi.index]!;
          return (
            <div
              key={ev.id}
              data-testid={`logs-row-${ev.id}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: ROW_HEIGHT,
                transform: `translateY(${vi.start}px)`,
              }}
              className="flex items-center gap-3 font-mono text-caption"
            >
              <span className="text-text-500 w-20 shrink-0">{ev.ts.slice(11, 19)}</span>
              <span className={cn('w-12 shrink-0 uppercase', LEVEL_TEXT[ev.level])}>
                {ev.level}
              </span>
              <span className="text-text-500 w-32 shrink-0 truncate">{ev.source}</span>
              <span className="text-text-50 truncate">{ev.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RawJsonBlock({ events }: { events: readonly LogEvent[] }) {
  const ndjson = events.map((e) => e.raw ?? JSON.stringify(e)).join('\n');
  return (
    <pre
      data-testid="logs-json"
      className="h-[60vh] overflow-auto rounded-card bg-surface-800 px-3 py-2 font-mono text-caption text-text-300"
    >
      <code>{ndjson || '// no events match the current filter'}</code>
    </pre>
  );
}
