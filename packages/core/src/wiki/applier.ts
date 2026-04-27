// Atomic edit applier for the wiki.
//
// Each edit is staged to a sibling temp file (<file>.tmp.<rand>) and renamed
// into place. If any edit fails mid-batch, prior renames are rolled back by
// either restoring the previous content (capture-on-rename) or removing the
// new file when no previous version existed.
//
// Pure-ish: a small `dryRun` mode lets callers (and tests) preview which
// files would be touched without writing anything.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export type EditAction = 'create' | 'update';

export interface WikiEdit {
  /** Path relative to the wiki root, using forward slashes. */
  file: string;
  action: EditAction;
  content: string;
}

export interface ApplyResult {
  applied: string[];
  rolledBack: string[];
}

export interface ApplyOptions {
  dryRun?: boolean;
}

/**
 * Apply edits atomically per file. On any failure mid-batch, undoes prior
 * renames and returns the rolled-back paths in `rolledBack`.
 */
export function applyEdits(
  wikiRoot: string,
  edits: ReadonlyArray<WikiEdit>,
  opts: ApplyOptions = {},
): ApplyResult {
  if (opts.dryRun === true) {
    return { applied: edits.map((e) => e.file), rolledBack: [] };
  }

  const applied: string[] = [];
  const undo: Array<{ file: string; previous: string | null }> = [];

  try {
    for (const edit of edits) {
      const target = path.join(wikiRoot, edit.file);
      fs.mkdirSync(path.dirname(target), { recursive: true });

      const previous = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
      const tmp = `${target}.tmp.${randomBytes(6).toString('hex')}`;
      fs.writeFileSync(tmp, edit.content, 'utf8');
      fs.renameSync(tmp, target);

      undo.push({ file: target, previous });
      applied.push(edit.file);
    }
    return { applied, rolledBack: [] };
  } catch {
    const rolledBack: string[] = [];
    for (const u of undo.reverse()) {
      try {
        if (u.previous === null) {
          fs.rmSync(u.file, { force: true });
        } else {
          fs.writeFileSync(u.file, u.previous, 'utf8');
        }
        rolledBack.push(path.relative(wikiRoot, u.file).replaceAll('\\', '/'));
      } catch {
        // best-effort; continue rolling back the rest
      }
    }
    return { applied: [], rolledBack };
  }
}
