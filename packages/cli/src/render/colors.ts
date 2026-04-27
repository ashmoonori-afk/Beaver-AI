// Semantic color palette + TTY/NO_COLOR detection.
//
// Per docs/models/ui-policy.md: success=green, warn=yellow, error=red,
// info=cyan, prompt=bold, dim=gray. Color is always paired with text or a
// symbol (color never carries meaning alone). Stripped automatically when
// stdout is not a TTY, when NO_COLOR is set, or when the global --no-color
// flag was passed.

const ESC = '\x1b';

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  cyan: 36,
  gray: 90,
} as const;

let colorOverride: boolean | null = null;

/** Called by bin.ts when `--no-color` is parsed. */
export function setColorOverride(enabled: boolean | null): void {
  colorOverride = enabled;
}

export function colorEnabled(stream: NodeJS.WriteStream = process.stdout): boolean {
  if (colorOverride !== null) return colorOverride;
  if (process.env['NO_COLOR']) return false;
  return Boolean(stream.isTTY);
}

function wrap(code: number, text: string, stream?: NodeJS.WriteStream): string {
  if (!colorEnabled(stream)) return text;
  return `${ESC}[${code}m${text}${ESC}[${CODES.reset}m`;
}

export const color = {
  success: (s: string): string => wrap(CODES.green, s),
  warn: (s: string): string => wrap(CODES.yellow, s),
  error: (s: string): string => wrap(CODES.red, s),
  info: (s: string): string => wrap(CODES.cyan, s),
  prompt: (s: string): string => wrap(CODES.bold, s),
  dim: (s: string): string => wrap(CODES.dim, s),
  gray: (s: string): string => wrap(CODES.gray, s),
} as const;

/** Strip ANSI escapes — used by tests + when piping. */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
