// Live elapsed mm:ss. Derives the value from Date.now() on a 1 s tick;
// freezes at terminal state (when endedAt is set) per the design rule.

import { useEffect, useState } from 'react';

import type { RunSnapshot } from '../types.js';
import { TERMINAL_RUN_STATES } from '../types.js';

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <span className="text-caption text-text-500">Elapsed</span>
      <div className="text-hero text-text-50 font-mono">{elapsed}</div>
      <div className="text-caption text-text-500">{isTerminal ? 'frozen' : 'live'}</div>
    </div>
  );
}

export const __test__ = { formatElapsed };
