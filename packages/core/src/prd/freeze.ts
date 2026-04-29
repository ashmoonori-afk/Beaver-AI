// PRD freeze: copy <workspace>/.beaver/prd-draft.md to prd.md and
// write the static Ralph PROMPT.md alongside it. v0.2 M1.5.
//
// Called by the orchestrator after the user approves the
// `goal-refinement` checkpoint. Returns the {prdPath, promptPath}
// pair so the caller can record them in the prd_runs ledger row.

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Bundled CLI ships the prompts under `prd-prompts/` next to bin.mjs;
// the dev source ships them under `prompts/`. Mirror the same dual
// lookup the wiki module uses.
const PROMPTS_DIR = (() => {
  const dev = path.join(HERE, 'prompts');
  if (fs.existsSync(dev)) return dev;
  return path.join(HERE, 'prd-prompts');
})();

const RALPH_PROMPT_FILE = 'ralph-prompt.md';

export interface FreezePrdInput {
  /** Active workspace root. `.beaver/` is created if missing. */
  repoRoot: string;
  /** Source draft path. Defaults to `<repoRoot>/.beaver/prd-draft.md`. */
  draftPath?: string;
}

export interface FreezePrdResult {
  /** ULID-style id (UUID for v0.2 simplicity). */
  id: string;
  /** Absolute path to the frozen prd.md. */
  prdPath: string;
  /** Absolute path to the static PROMPT.md alongside it. */
  promptPath: string;
  /** ISO timestamp of the freeze. */
  frozenAt: string;
}

/** Copy the current PRD draft to prd.md and write PROMPT.md. Throws
 *  when the draft is missing — the orchestrator only calls this on
 *  approve so a missing draft is a programmer error worth surfacing. */
export async function freezePrd(input: FreezePrdInput): Promise<FreezePrdResult> {
  const beaverDir = path.join(input.repoRoot, '.beaver');
  await fs.promises.mkdir(beaverDir, { recursive: true });

  const draftPath = input.draftPath ?? path.join(beaverDir, 'prd-draft.md');
  const draft = await fs.promises.readFile(draftPath, 'utf8');

  const prdPath = path.join(beaverDir, 'prd.md');
  await fs.promises.writeFile(prdPath, draft, 'utf8');

  const promptSource = path.join(PROMPTS_DIR, RALPH_PROMPT_FILE);
  const promptBody = await fs.promises.readFile(promptSource, 'utf8');
  const promptPath = path.join(beaverDir, 'PROMPT.md');
  await fs.promises.writeFile(promptPath, promptBody, 'utf8');

  return {
    id: `prd-${randomUUID()}`,
    prdPath,
    promptPath,
    frozenAt: new Date().toISOString(),
  };
}
