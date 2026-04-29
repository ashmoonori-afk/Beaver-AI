// Local-only KR1–KR5 metrics logger. v0.2 M4.2.
//
// Appends one JSONL row to <repoRoot>/.beaver/metrics.jsonl per
// measured event so the team can compute KRs from disk without any
// network call (PRD constraint: no telemetry, local-first).
//
// Schema is intentionally tiny so v0.2.x can add fields without
// breaking older readers — every consumer must tolerate unknown keys.

import fs from 'node:fs';
import path from 'node:path';

const METRICS_FILENAME = 'metrics.jsonl';

export type MetricEvent =
  | { kr: 'KR1'; runId: string; submittedAtMs: number; confirmedAtMs: number; deltaMs: number }
  | {
      kr: 'KR2';
      runId: string;
      confirmedAtMs: number;
      finishedAtMs: number;
      deltaMs: number;
      finalState: string;
    }
  | { kr: 'KR5'; runId: string; finalState: string; usedPrdPath: boolean };

/** Append a metric event to `<repoRoot>/.beaver/metrics.jsonl`.
 *  Best-effort: a write failure is swallowed so a metric outage
 *  never affects the run. Creates `.beaver/` if missing. */
export function recordMetric(repoRoot: string, event: MetricEvent): void {
  try {
    const dir = path.join(repoRoot, '.beaver');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, METRICS_FILENAME);
    const enriched = { ...event, ts: new Date().toISOString() };
    fs.appendFileSync(file, `${JSON.stringify(enriched)}\n`, 'utf8');
  } catch {
    // Metrics are observability, not load-bearing.
  }
}

/** Read every recorded metric back as a flat array. Used by the
 *  v0.2.0 release-notes script and any post-incident audit. Returns
 *  `[]` when the file is missing. */
export function readMetrics(repoRoot: string): MetricEvent[] {
  try {
    const file = path.join(repoRoot, '.beaver', METRICS_FILENAME);
    const body = fs.readFileSync(file, 'utf8');
    return body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as MetricEvent);
  } catch {
    return [];
  }
}
