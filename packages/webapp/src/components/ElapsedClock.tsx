// Live elapsed mm:ss. Derives the value from Date.now() on a 1 s tick;
// freezes at terminal state (when endedAt is set) per the design rule.
//
// Caption: "live" while ticking, the formatted endedAt timestamp once
// terminal (e.g. "ended 09:42:15"). Old "frozen" wording was confusing
// — it sounded like a UI freeze, not an intentional clock stop.

import { useEffect, useState } from 'react';

import type { RunSnapshot } from '../types.js';
import { TERMINAL_RUN_STATES } from '../types.js';

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatEndedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export interface ElapsedClockProps {
  startedAt: string;
  endedAt?: string;
  state: RunSnapshot['state'];
}

export function ElapsedClock({ startedAt, endedAt, state }: ElapsedClockProps) {
  const isTerminal = TERMINAL_RUN_STATES.has(state);
  const [, force] = useState(0);

  useEffect(() => {
    if (isTerminal) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isTerminal]);

  const startedMs = Date.parse(startedAt);
  const endMs = endedAt ? Date.parse(endedAt) : Date.now();
  const elapsed = formatElapsed(endMs - startedMs);
  const endedHms = formatEndedAt(endedAt);
  const caption = isTerminal ? (endedHms ? `ended ${endedHms}` : null) : 'live';

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <span className="text-caption text-text-500">Elapsed</span>
      <div className="text-hero text-text-50 font-mono">{elapsed}</div>
      {caption ? <div className="text-caption text-text-500">{caption}</div> : null}
    </div>
  );
}

export const __test__ = { formatElapsed, formatEndedAt };
