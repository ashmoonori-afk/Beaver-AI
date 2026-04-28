#!/usr/bin/env node
// Post-build step: ship every disk-resident data file consumed at
// runtime alongside the bundled bin.mjs. esbuild collapses every
// module's `import.meta.url` to bin.mjs's directory, so we copy each
// data folder to a unique name there to avoid collisions.
//
// Source code in @beaver-ai/core uses `existsSync` fallbacks so dev
// (TS sources) keeps reading from the original locations and prod
// (bundled) reads from these copies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const DIST = path.resolve(HERE, '..', 'dist');

/** [src, dest-relative-to-DIST] pairs. */
const COPIES = [
  // Workspace migrations — `migrate.ts` looks for `<HERE>/migrations`.
  ['packages/core/src/workspace/migrations', 'migrations'],

  // Agent baselines — `agent-baseline/render.ts` looks for `<HERE>/AGENT_BASELINE.md` and `<HERE>/role/<name>.md`.
  ['packages/core/src/agent-baseline/AGENT_BASELINE.md', 'AGENT_BASELINE.md'],
  ['packages/core/src/agent-baseline/role', 'role'],

  // Provider rate tables — `budget/seed.ts` falls back to `<HERE>/rates`.
  ['packages/core/rates', 'rates'],

  // Wiki — `wiki-templates/`, `wiki-prompts/` to avoid colliding with
  // decisions/prompts under the single bundled dir.
  ['packages/core/src/wiki/templates', 'wiki-templates'],
  ['packages/core/src/wiki/prompts', 'wiki-prompts'],

  // Decision prompts.
  ['packages/core/src/orchestrator/decisions/prompts', 'decisions-prompts'],
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const childSrc = path.join(src, entry.name);
    const childDest = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(childSrc, childDest);
    } else if (entry.isFile()) {
      fs.copyFileSync(childSrc, childDest);
    }
  }
}

function main() {
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }
  for (const [srcRel, destRel] of COPIES) {
    const src = path.join(REPO, srcRel);
    const dest = path.join(DIST, destRel);
    if (!fs.existsSync(src)) {
      console.error(`[copy-data-files] missing: ${src}`);
      process.exit(1);
    }
    copyRecursive(src, dest);
    console.log(`[copy-data-files] ${srcRel} -> dist/${destRel}`);
  }
}

main();
