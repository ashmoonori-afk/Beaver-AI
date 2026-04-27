// Pure path helpers for sandbox classification.
// No fs / no I/O — everything operates on the strings the caller provides.

import path from 'node:path';

/** Normalize a path string against a working directory. Absolute paths are
 *  normalized as-is; relative paths are resolved against `cwd`. */
export function resolveAgainst(p: string, cwd: string): string {
  return path.isAbsolute(p) ? path.normalize(p) : path.resolve(cwd, p);
}

/** True when `target` is `dir` itself or a descendant of `dir`.
 *  Both inputs should be absolute and normalized. */
export function isInsideOrEqual(target: string, dir: string): boolean {
  if (target === dir) return true;
  const rel = path.relative(dir, target);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** True when `p` is a system-critical root (`/`, root drive, or HOME literal).
 *  HOME literals match `~` and `$HOME` because the classifier is pure and
 *  cannot expand against the runtime environment. */
export function isSystemRoot(p: string): boolean {
  if (p === '/' || p === '\\') return true;
  if (p === '~' || p === '$HOME') return true;
  // Windows drive root e.g. "C:\" or "C:/"
  if (/^[A-Za-z]:[/\\]?$/.test(p)) return true;
  return false;
}

/** Strip a leading `cd <dir> && ` clause if present and return the rewritten
 *  effective cwd + remainder. Used to detect `cd / && rm -rf .` patterns
 *  where the bare regex on the remainder alone would miss. */
export function effectiveCwd(cmd: string, fallbackCwd: string): { cwd: string; rest: string } {
  const m = /^\s*cd\s+(\S+)\s*(?:&&|;)\s*(.+)$/s.exec(cmd);
  if (!m || !m[1] || !m[2]) return { cwd: fallbackCwd, rest: cmd };
  const newCwd = m[1] === '~' || m[1] === '$HOME' ? m[1] : path.normalize(m[1]);
  return { cwd: newCwd, rest: m[2] };
}
