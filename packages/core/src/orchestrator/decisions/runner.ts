// Shared sub-decision runner. One file per decision lives next to this one;
// each calls `runDecision()` to keep the validation/retry/cost-tracking
// behavior in a single place.
//
// Spaghetti rules
// - No general "askLLM" abstraction at the orchestrator surface — each
//   decision file owns its prompt + schema and exposes a typed function.
// - This runner is an internal helper, not exported from the package barrel.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { z } from 'zod';

import type { ProviderAdapter } from '../../types/provider.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Bundled mode collapses every module's HERE to bin.mjs's directory,
// where wiki and decisions both want a `prompts/` folder. The build
// script copies decisions prompts to `decisions-prompts/`.
const PROMPTS_DIR = (() => {
  const dev = path.join(HERE, 'prompts');
  if (fs.existsSync(dev)) return dev;
  return path.join(HERE, 'decisions-prompts');
})();

export class SubDecisionValidationError extends Error {
  constructor(
    public readonly decisionName: string,
    public readonly attempts: number,
    public readonly lastError: string,
  ) {
    super(
      `sub-decision validation failed for "${decisionName}" after ${attempts} attempt(s): ${lastError}`,
    );
    this.name = 'SubDecisionValidationError';
  }
}

export interface RunDecisionOptions<T> {
  decisionName: string;
  promptName: string;
  substitutions: Record<string, string>;
  schema: z.ZodType<T>;
  adapter: ProviderAdapter;
  /** Optional workdir override; defaults to a fresh tmpdir per call. */
  workdir?: string;
}

const REHEARSAL_HEADER = `# Schema rehearsal\n\nYour previous response did not parse as the required JSON schema. Re-read the output contract below and reply with ONLY the JSON object on the final stdout line.\n\n---\n\n`;

export async function runDecision<T>(opts: RunDecisionOptions<T>): Promise<T> {
  const prompt = renderPrompt(opts.promptName, opts.substitutions);
  const workdir = opts.workdir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'beaver-dec-'));

  const first = await callAndParse(opts, prompt, workdir);
  if (first.ok) return first.value;

  const second = await callAndParse(opts, REHEARSAL_HEADER + prompt, workdir);
  if (second.ok) return second.value;

  throw new SubDecisionValidationError(opts.decisionName, 2, second.error);
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
  opts: RunDecisionOptions<T>,
  prompt: string,
  workdir: string,
): Promise<ParsedOk<T> | ParsedErr> {
  const result = await opts.adapter.run({ prompt, workdir });
  const lastJsonLine = pickLastJsonLine(result.finalAssistantMessage ?? result.summary);
  if (!lastJsonLine) return { ok: false, error: 'no JSON object on final line' };
  let raw: unknown;
  try {
    raw = JSON.parse(lastJsonLine);
  } catch (e) {
    return { ok: false, error: `JSON.parse: ${(e as Error).message}` };
  }
  const r = opts.schema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => i.message).join('; ') };
}

/** Pick the last non-empty stdout line that parses as a JSON object. */
function pickLastJsonLine(text: string): string | null {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i]!.trim();
    if (l.startsWith('{') && l.endsWith('}')) return l;
  }
  return null;
}

export function renderPrompt(promptName: string, subs: Record<string, string>): string {
  const filePath = path.join(PROMPTS_DIR, `${promptName}.md`);
  let body = fs.readFileSync(filePath, 'utf8');
  for (const [k, v] of Object.entries(subs)) {
    body = body.replaceAll(`{{${k}}}`, v);
  }
  return body;
}
