// Wiki bootstrap — idempotent initializer for `<configDir>/wiki/`.
//
// Behavior:
// - Creates wiki root + subdirectories (projects/, decisions/, patterns/) if
//   missing.
// - Seeds SCHEMA.md, index.md, log.md, user-profile.md from `templates/`
//   ONLY if they do not already exist (does NOT overwrite user edits).
// - Fail-soft: if any filesystem operation throws EACCES, the warning is
//   surfaced via the optional `onWarn` callback (no console.* in production)
//   and `{ created: false }` is returned. All other errors propagate.
//
// Per docs/models/wiki-system.md the wiki is best-effort: failures must
// never escalate. Callers in the orchestrator FSM treat a `false` here as
// "no wiki this session" and skip ingest/query.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(HERE, 'templates');

const SEED_FILES = ['SCHEMA.md', 'index.md', 'log.md', 'user-profile.md'] as const;
const SUBDIRS = ['projects', 'decisions', 'patterns'] as const;

export interface BootstrapResult {
  /** True if the wiki layout was created or extended on this call. */
  created: boolean;
  /** Resolved absolute path to the wiki root (`<configDir>/wiki`). */
  path: string;
}

export interface EnsureWikiOptions {
  /** Surface non-fatal warnings without using console.*. */
  onWarn?: (message: string) => void;
}

/**
 * Idempotently ensure `<configDir>/wiki/` exists with seed files.
 * Safe to call repeatedly. Never overwrites a file that already exists.
 */
export function ensureWiki(configDir: string, opts: EnsureWikiOptions = {}): BootstrapResult {
  const wikiRoot = path.join(configDir, 'wiki');
  let touched = false;

  try {
    if (!fs.existsSync(wikiRoot)) {
      fs.mkdirSync(wikiRoot, { recursive: true });
      touched = true;
    }

    for (const sub of SUBDIRS) {
      const subPath = path.join(wikiRoot, sub);
      if (!fs.existsSync(subPath)) {
        fs.mkdirSync(subPath, { recursive: true });
        touched = true;
      }
    }

    for (const seed of SEED_FILES) {
      const target = path.join(wikiRoot, seed);
      if (fs.existsSync(target)) continue;
      const tmplPath = path.join(TEMPLATES_DIR, seed);
      const body = fs.readFileSync(tmplPath, 'utf8');
      fs.writeFileSync(target, body, 'utf8');
      touched = true;
    }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      opts.onWarn?.(`wiki bootstrap skipped at ${wikiRoot}: ${(e as Error).message}`);
      return { created: false, path: wikiRoot };
    }
    throw e;
  }

  return { created: touched, path: wikiRoot };
}
