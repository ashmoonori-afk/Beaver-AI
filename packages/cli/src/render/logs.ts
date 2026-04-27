// Log line renderer per ui-policy.md.
//
// Pretty mode: `<HH:MM:SS> <source> <type> · <message>`.
// JSON mode: NDJSON, one event per line, suitable for `jq` piping.

import type { EventRow } from '@beaver-ai/core';

import { color } from './colors.js';

export interface LogRenderOptions {
  json?: boolean;
}

function hhmmss(ts: string): string {
  // events.ts owns the ISO string; tolerate non-ISO by falling back to raw.
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const pad = (n: number): string => n.toString().padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

function messageFromPayload(payload: string | null): string {
  if (!payload) return '';
  try {
    const parsed: unknown = JSON.parse(payload);
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
      const m = (parsed as { message: unknown }).message;
      if (typeof m === 'string') return m;
    }
    return payload;
  } catch {
    return payload;
  }
}

export function renderLogLine(row: EventRow, opts: LogRenderOptions = {}): string {
  if (opts.json) {
    return JSON.stringify({
      id: row.id,
      run_id: row.run_id,
      ts: row.ts,
      source: row.source,
      type: row.type,
      payload_json: row.payload_json,
    });
  }
  const t = color.dim(hhmmss(row.ts));
  const src = color.info(row.source);
  const ty = color.prompt(row.type);
  const msg = messageFromPayload(row.payload_json);
  return `${t} ${src} ${ty} · ${msg}`;
}

export function renderLogs(rows: EventRow[], opts: LogRenderOptions = {}): string {
  return rows.map((r) => renderLogLine(r, opts)).join('\n');
}
