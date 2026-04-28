// Post-run wiki ingest.
//
// Reads the run's events, plan history, and cost ledger from the workspace
// SQLite ledger; calls the provider adapter with a tightly-scoped prompt;
// validates the returned edit list against a small zod schema; applies the
// edits atomically via applier.ts.
//
// Per docs/models/wiki-system.md the ingest is best-effort:
// - Failures (validation, adapter, EACCES) never throw out of `ingest()`;
//   they are returned in the result so the orchestrator can log a
//   `wiki.ingest.failed` event without affecting run outcome.
// - Budget defaults to $0.10 (separate from run budget).
// - log.md is appended only after the required pages succeed; its line is
//   the marker that an ingest completed.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { ProviderAdapter } from '../types/provider.js';
import { listEventsByRun } from '../workspace/dao/events.js';
import { listPlansByRun } from '../workspace/dao/plans.js';
import { sumCostsByRun } from '../workspace/dao/costs.js';
import { getRun } from '../workspace/dao/runs.js';
import type { Db } from '../workspace/db.js';

import { applyEdits } from './applier.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Bundled mode collapses every module's HERE to bin.mjs's directory,
// so wiki and decisions both want `prompts/`. The build script
// resolves the collision by copying wiki prompts to `wiki-prompts/`.
const PROMPTS_DIR = (() => {
  const dev = path.join(HERE, 'prompts');
  if (fs.existsSync(dev)) return dev;
  return path.join(HERE, 'wiki-prompts');
})();
const DEFAULT_BUDGET_USD = 0.1;
const EVENTS_EXCERPT_LIMIT = 40;

const EditSchema = z.object({
  file: z
    .string()
    .min(1)
    .refine((p) => !p.startsWith('/') && !p.includes('..'), 'file must be relative within wiki'),
  action: z.enum(['create', 'update']),
  content: z.string(),
});

const IngestEditsSchema = z.object({
  edits: z.array(EditSchema).min(1),
});

export type IngestStatus = 'ok' | 'budget_exceeded' | 'validation_failed' | 'adapter_failed';

export interface IngestResult {
  status: IngestStatus;
  appliedFiles: string[];
  rolledBackFiles: string[];
  /** Human-readable reason when status !== 'ok'. */
  error?: string;
}

export interface IngestInput {
  db: Db;
  runId: string;
  /** Wiki root, e.g. <configDir>/wiki. Must already exist (call ensureWiki first). */
  configDir: string;
  adapter: ProviderAdapter;
  /** Project slug for the projects/<slug>.md page. Falls back to project_id. */
  projectSlug?: string;
  budgetUsd?: number;
}

export async function ingest(input: IngestInput): Promise<IngestResult> {
  const wikiRoot = path.join(input.configDir, 'wiki');
  if (!fs.existsSync(wikiRoot)) {
    return {
      status: 'validation_failed',
      appliedFiles: [],
      rolledBackFiles: [],
      error: `wiki root missing: ${wikiRoot}`,
    };
  }

  const run = getRun(input.db, input.runId);
  if (!run) {
    return {
      status: 'validation_failed',
      appliedFiles: [],
      rolledBackFiles: [],
      error: `run not found: ${input.runId}`,
    };
  }

  const events = listEventsByRun(input.db, input.runId);
  const plans = listPlansByRun(input.db, input.runId);
  const costUsd = sumCostsByRun(input.db, input.runId);
  const projectSlug = input.projectSlug ?? run.project_id;

  const schema = readSchema(wikiRoot);
  const eventsExcerpt = events
    .slice(-EVENTS_EXCERPT_LIMIT)
    .map((e) => `${e.ts} ${e.source} ${e.type}`)
    .join('\n');

  const prompt = renderPrompt('ingest', {
    runId: input.runId,
    projectSlug,
    goal: run.goal,
    status: run.status,
    planCount: String(plans.length),
    costUsd: costUsd.toFixed(4),
    schema,
    eventsExcerpt: eventsExcerpt || '(no events)',
  });

  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-wiki-ingest-'));
  let raw;
  try {
    raw = await input.adapter.run({
      prompt,
      workdir,
      budget: { usd: input.budgetUsd ?? DEFAULT_BUDGET_USD, warnThresholdPct: 70 },
    });
  } catch (e) {
    return {
      status: 'adapter_failed',
      appliedFiles: [],
      rolledBackFiles: [],
      error: `adapter.run threw: ${(e as Error).message}`,
    };
  }

  if (raw.status === 'budget_exceeded') {
    return {
      status: 'budget_exceeded',
      appliedFiles: [],
      rolledBackFiles: [],
      error: `wiki ingest exceeded budget $${(input.budgetUsd ?? DEFAULT_BUDGET_USD).toFixed(2)}`,
    };
  }

  const lastJson = pickLastJsonLine(raw.finalAssistantMessage ?? raw.summary);
  if (!lastJson) {
    return {
      status: 'validation_failed',
      appliedFiles: [],
      rolledBackFiles: [],
      error: 'no JSON object on final line of adapter output',
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastJson);
  } catch (e) {
    return {
      status: 'validation_failed',
      appliedFiles: [],
      rolledBackFiles: [],
      error: `JSON.parse: ${(e as Error).message}`,
    };
  }
  const validated = IngestEditsSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      status: 'validation_failed',
      appliedFiles: [],
      rolledBackFiles: [],
      error: validated.error.issues.map((i) => i.message).join('; '),
    };
  }

  // log.md is the success marker and is owned by Beaver, not the model.
  // Strip any model-supplied edit to it so we don't overwrite prior history.
  const edits = validated.data.edits.filter((e) => e.file !== 'log.md');
  if (edits.length === 0) {
    return {
      status: 'validation_failed',
      appliedFiles: [],
      rolledBackFiles: [],
      error: 'no edits remained after stripping log.md',
    };
  }
  const result = applyEdits(wikiRoot, edits);
  if (result.applied.length === 0) {
    return {
      status: 'validation_failed',
      appliedFiles: [],
      rolledBackFiles: result.rolledBack,
      error: 'applyEdits rolled back; no files written',
    };
  }

  appendLogLine(wikiRoot, input.runId, projectSlug);

  return { status: 'ok', appliedFiles: result.applied, rolledBackFiles: [] };
}

function readSchema(wikiRoot: string): string {
  const p = path.join(wikiRoot, 'SCHEMA.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '(missing)';
}

function renderPrompt(name: string, subs: Record<string, string>): string {
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);
  let body = fs.readFileSync(filePath, 'utf8');
  for (const [k, v] of Object.entries(subs)) {
    body = body.replaceAll(`{{${k}}}`, v);
  }
  return body;
}

function pickLastJsonLine(text: string): string | null {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!.trim();
    if (l.startsWith('{') && l.endsWith('}')) return l;
  }
  return null;
}

function appendLogLine(wikiRoot: string, runId: string, projectSlug: string): void {
  const logPath = path.join(wikiRoot, 'log.md');
  const date = new Date().toISOString().slice(0, 10);
  const line = `\n## [${date}] ingest | ${runId} · ${projectSlug}\n`;
  fs.appendFileSync(logPath, line, 'utf8');
}
