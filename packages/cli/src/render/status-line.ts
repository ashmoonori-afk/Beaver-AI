// Bottom-fixed status line per ui-policy.md.
//
// Pure renderer + a tiny start/stop loop driver. The renderer (formatStatus)
// has no I/O. The driver (StatusLine class) writes to stdout at most once a
// second and is fully suppressed when stdout is not a TTY.

import { color } from './colors.js';

export interface StatusLineData {
  state: string;
  runningTasks: number;
  totalTasks: number;
  spentUsd: number;
  elapsedMs: number;
  openCheckpoints: number;
}

function fmtElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatStatusLine(d: StatusLineData): string {
  const state = color.prompt(`[${d.state.toUpperCase()}]`);
  const tasks = `running ${d.runningTasks}/${d.totalTasks}`;
  const spent = `spent $${d.spentUsd.toFixed(2)}`;
  const elapsed = `elapsed ${fmtElapsed(d.elapsedMs)}`;
  const open = d.openCheckpoints > 0 ? ` · ⌛ ${d.openCheckpoints} open` : '';
  return `${state} ${tasks} · ${spent} · ${elapsed}${open}`;
}

export interface StatusLineOptions {
  stream?: NodeJS.WriteStream;
  intervalMs?: number;
  /** When false (or stdout is not a TTY), the line is never drawn. */
  enabled?: boolean;
}

const ESC = '\x1b';
const CLEAR_LINE = `${ESC}[2K\r`;

/**
 * Owns the once-per-second redraw. Subcommands push fresh data via update();
 * stop() clears the line on shutdown. Non-TTY = full no-op.
 */
export class StatusLine {
  private readonly stream: NodeJS.WriteStream;
  private readonly intervalMs: number;
  private readonly enabled: boolean;
  private timer: NodeJS.Timeout | null = null;
  private current: StatusLineData | null = null;

  constructor(opts: StatusLineOptions = {}) {
    this.stream = opts.stream ?? process.stdout;
    this.intervalMs = opts.intervalMs ?? 1000;
    this.enabled = (opts.enabled ?? true) && Boolean(this.stream.isTTY);
  }

  update(data: StatusLineData): void {
    this.current = data;
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => this.draw(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.enabled) this.stream.write(CLEAR_LINE);
  }

  private draw(): void {
    if (!this.enabled || !this.current) return;
    this.stream.write(CLEAR_LINE + formatStatusLine(this.current));
  }
}
