// Wiki query — two entry points:
//
// 1. queryWiki({ wikiRoot, kind, context })
//    Structured hint per docs/models/wiki-system.md §Query. Used by the
//    feedback layer at `plan-approval` and `risky-change-confirmation`
//    checkpoints. Returns { hint?, sourcePages }. No `hint` key when no
//    relevant prior context exists (caller suppresses the hint line).
//
// 2. askWiki({ wikiRoot, question, adapter, budgetUsd? })
//    Free-form natural-language Q&A. The user (or any caller) supplies a
//    plain question; the keeper reads relevant pages and returns a grounded
//    answer plus the source pages it cited.
//
// Both entry points are best-effort: empty wiki, no adapter output, or
// validation failure all degrade to a clear "no info" result rather than
// throwing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { ProviderAdapter } from '../types/provider.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// See wiki/ingest.ts — bundled mode disambiguates wiki vs decisions
// prompts via a `wiki-prompts/` directory next to bin.mjs.
const PROMPTS_DIR = (() => {
  const dev = path.join(HERE, 'prompts');
  if (fs.existsSync(dev)) return dev;
  return path.join(HERE, 'wiki-prompts');
})();
const DEFAULT_BUDGET_USD = 0.05;
const MAX_PAGES_INCLUDED = 6;
const MAX_PAGE_CHARS = 4_000;

const HintSchema = z.object({ hint: z.string().min(1).nullable() });
const AskSchema = z.object({ answer: z.string().min(1) });

export interface QueryWikiInput {
  wikiRoot: string;
  /** Checkpoint kind, e.g. 'plan-approval' or 'risky-change-confirmation'. */
  kind: string;
  /** Free-form context object; serialized to the prompt as JSON. */
  context: Record<string, unknown>;
  adapter: ProviderAdapter;
  budgetUsd?: number;
}

export interface QueryWikiResult {
  hint?: string;
  sourcePages: string[];
}

export interface AskWikiInput {
  wikiRoot: string;
  /** Natural-language question, e.g. "what did we decide last about auth?". */
  question: string;
  adapter: ProviderAdapter;
  budgetUsd?: number;
}

export interface AskWikiResult {
  answer: string;
  sourcePages: string[];
}

const NO_INFO_ANSWER = 'no relevant info in the wiki';

export async function queryWiki(input: QueryWikiInput): Promise<QueryWikiResult> {
  const pages = readRelevantPages(input.wikiRoot);
  if (pages.length === 0) {
    return { sourcePages: [] };
  }
  const prompt = renderPrompt('hint', {
    kind: input.kind,
    context: JSON.stringify(input.context, null, 2),
    pages: renderPages(pages),
  });
  const parsed = await callAndParse(input.adapter, prompt, HintSchema, input.budgetUsd);
  if (!parsed.ok || parsed.value.hint === null) {
    return { sourcePages: pages.map((p) => p.relativePath) };
  }
  return { hint: parsed.value.hint, sourcePages: pages.map((p) => p.relativePath) };
}

export async function askWiki(input: AskWikiInput): Promise<AskWikiResult> {
  const pages = readRelevantPages(input.wikiRoot);
  if (pages.length === 0) {
    return { answer: NO_INFO_ANSWER, sourcePages: [] };
  }
  const prompt = renderPrompt('ask', {
    question: input.question,
    pages: renderPages(pages),
  });
  const parsed = await callAndParse(input.adapter, prompt, AskSchema, input.budgetUsd);
  if (!parsed.ok) {
    return { answer: NO_INFO_ANSWER, sourcePages: pages.map((p) => p.relativePath) };
  }
  return { answer: parsed.value.answer, sourcePages: pages.map((p) => p.relativePath) };
}

interface PageInclude {
  relativePath: string;
  body: string;
}

/** Pull the most relevant pages for an LLM query. v0.1: simple recency-based. */
function readRelevantPages(wikiRoot: string): PageInclude[] {
  if (!fs.existsSync(wikiRoot)) return [];
  const candidates: string[] = [];
  for (const top of ['user-profile.md', 'index.md']) {
    const p = path.join(wikiRoot, top);
    if (fs.existsSync(p) && fs.statSync(p).size > 0) candidates.push(p);
  }
  for (const sub of ['decisions', 'projects', 'patterns']) {
    const dir = path.join(wikiRoot, sub);
    if (!fs.existsSync(dir)) continue;
    const entries = fs
      .readdirSync(dir)
      .filter((n) => n.endsWith('.md'))
      .map((n) => path.join(dir, n));
    entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    candidates.push(...entries);
  }

  const pages: PageInclude[] = [];
  for (const file of candidates.slice(0, MAX_PAGES_INCLUDED)) {
    const body = fs.readFileSync(file, 'utf8').slice(0, MAX_PAGE_CHARS);
    if (body.trim().length === 0) continue;
    pages.push({
      relativePath: path.relative(wikiRoot, file).replaceAll('\\', '/'),
      body,
    });
  }
  return pages;
}

function renderPages(pages: PageInclude[]): string {
  return pages.map((p) => `### ${p.relativePath}\n\n${p.body}`).join('\n\n---\n\n');
}

function renderPrompt(name: string, subs: Record<string, string>): string {
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);
  let body = fs.readFileSync(filePath, 'utf8');
  for (const [k, v] of Object.entries(subs)) {
    body = body.replaceAll(`{{${k}}}`, v);
  }
  return body;
}

interface ParsedOk<T> {
  ok: true;
  value: T;
}
interface ParsedErr {
  ok: false;
  error: string;
}

async function callAndParse<T>(
  adapter: ProviderAdapter,
  prompt: string,
  schema: z.ZodType<T>,
  budgetUsd?: number,
): Promise<ParsedOk<T> | ParsedErr> {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-wiki-q-'));
  let raw;
  try {
    raw = await adapter.run({
      prompt,
      workdir,
      budget: { usd: budgetUsd ?? DEFAULT_BUDGET_USD, warnThresholdPct: 70 },
    });
  } catch (e) {
    return { ok: false, error: `adapter.run threw: ${(e as Error).message}` };
  }
  if (raw.status === 'budget_exceeded') return { ok: false, error: 'budget_exceeded' };

  const lastJson = pickLastJsonLine(raw.finalAssistantMessage ?? raw.summary);
  if (!lastJson) return { ok: false, error: 'no JSON object on final line' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(lastJson);
  } catch (e) {
    return { ok: false, error: `JSON.parse: ${(e as Error).message}` };
  }
  const r = schema.safeParse(parsed);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
}

function pickLastJsonLine(text: string): string | null {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!.trim();
    if (l.startsWith('{') && l.endsWith('}')) return l;
  }
  return null;
}
