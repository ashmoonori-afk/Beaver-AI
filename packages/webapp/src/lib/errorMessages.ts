// W.12.8 — error message classifier.
//
// The Tauri shell (and CLI sidecar) returns raw error strings from a
// half-dozen failure modes. This module maps them to a small set of
// user-actionable categories so the UI can pick the right copy + CTA
// without leaking the raw stack to the user. The classifier is pure
// (no React, no I/O) so unit-testing each pattern is cheap.

export type ErrorKind =
  | 'cli-missing'
  | 'network'
  | 'quota'
  | 'api-key'
  | 'workspace-missing'
  | 'workspace-invalid'
  | 'goal-empty'
  | 'generic';

export interface ClassifiedError {
  kind: ErrorKind;
  /** One-line headline shown in the banner. */
  title: string;
  /** Two-to-three sentence explanation of what went wrong + how to fix. */
  body: string;
  /** Optional CTA. Consumers wire this to a handler (e.g. open picker). */
  action?: {
    label: string;
    /** Stable identifier so consumers can pick the right handler without
     *  parsing label strings. */
    intent: 'pick-workspace' | 'retry' | 'open-docs';
    /** Documentation URL when the intent is 'open-docs'. Optional for
     *  the other intents. */
    href?: string;
  };
}

interface PatternRule {
  match: (raw: string) => boolean;
  classify: () => ClassifiedError;
}

const RULES: PatternRule[] = [
  {
    match: (m) => /no project folder selected/i.test(m),
    classify: () => ({
      kind: 'workspace-missing',
      title: 'No project folder selected',
      body:
        'Beaver writes plans, runs, and audit logs to .beaver/ inside your project. ' +
        'Pick the folder where you ran `beaver init` to continue.',
      action: { label: 'Pick folder…', intent: 'pick-workspace' },
    }),
  },
  {
    match: (m) => /doesn'?t look like a Beaver project|not a beaver project/i.test(m),
    classify: () => ({
      kind: 'workspace-invalid',
      title: 'That folder is not a Beaver project',
      body:
        'The selected folder is missing a `.beaver/` subdirectory. ' +
        'Open a terminal in the folder and run `beaver init` first, then pick it again.',
      action: { label: 'Pick a different folder…', intent: 'pick-workspace' },
    }),
  },
  {
    match: (m) => /goal:\s*empty after trim|goal.*empty/i.test(m),
    classify: () => ({
      kind: 'goal-empty',
      title: 'Goal is empty',
      body: 'Type a goal in the box and submit again.',
    }),
  },
  {
    match: (m) =>
      /no sidecar configured|failed to spawn sidecar|BEAVER_SIDECAR_NODE.*non-existent/i.test(m),
    classify: () => ({
      kind: 'cli-missing',
      title: 'Beaver CLI is not installed',
      body:
        'The desktop shell could not find the Beaver sidecar binary. ' +
        'Install it via `pnpm add -g @beaver-ai/cli` or wait for the bundled v0.1.0 installer.',
      action: {
        label: 'Open install docs',
        intent: 'open-docs',
        href: 'https://github.com/ashmoonori-afk/Beaver-AI-Dev#install',
      },
    }),
  },
  {
    match: (m) =>
      /(claude.*not found|claude.*command not recognized|ENOENT.*claude|spawn claude)/i.test(m),
    classify: () => ({
      kind: 'cli-missing',
      title: 'Claude Code CLI is not installed',
      body:
        'Beaver runs LLM calls through `claude` (the Claude Code CLI). ' +
        'Install it from npm with `pnpm add -g @anthropic-ai/claude-code` and try again.',
      action: {
        label: 'Open install docs',
        intent: 'open-docs',
        href: 'https://docs.claude.com/en/docs/claude-code',
      },
    }),
  },
  {
    match: (m) =>
      /(missing|not set|unset).*ANTHROPIC_API_KEY|ANTHROPIC_API_KEY.*(missing|not set|unset|required)/i.test(
        m,
      ),
    classify: () => ({
      kind: 'api-key',
      title: 'ANTHROPIC_API_KEY is not set',
      body:
        'Direct-API mode needs your Anthropic API key. Set it once in your shell ' +
        '(e.g. `export ANTHROPIC_API_KEY=sk-ant-...`) and restart Beaver.',
      action: {
        label: 'Open API key docs',
        intent: 'open-docs',
        href: 'https://docs.claude.com/en/api/getting-started',
      },
    }),
  },
  {
    match: (m) => /\b(429|rate.?limit|quota|tokens? exhaust|too many requests)\b/i.test(m),
    classify: () => ({
      kind: 'quota',
      title: 'Rate limit or quota exceeded',
      body:
        'Anthropic returned a 429 / quota error. Wait a few minutes before retrying, ' +
        'or check your usage at console.anthropic.com.',
      action: { label: 'Retry', intent: 'retry' },
    }),
  },
  {
    match: (m) =>
      /(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|network|getaddrinfo|offline)/i.test(m),
    classify: () => ({
      kind: 'network',
      title: 'Cannot reach Anthropic',
      body:
        "Beaver couldn't connect to the LLM endpoint. Check your network connection " +
        'or VPN, then retry.',
      action: { label: 'Retry', intent: 'retry' },
    }),
  },
];

/** Classify a raw error message into a user-facing category. Falls
 *  back to a 'generic' bucket that surfaces the (sanitized) raw
 *  message when no rule matches; we'd rather show *something* than
 *  swallow. */
export function classifyError(raw: unknown): ClassifiedError {
  const message =
    raw instanceof Error
      ? raw.message
      : typeof raw === 'string'
        ? raw
        : JSON.stringify(raw ?? 'unknown error');
  for (const rule of RULES) {
    if (rule.match(message)) return rule.classify();
  }
  return {
    kind: 'generic',
    title: 'Something went wrong',
    // review-pass v0.1: strip absolute filesystem paths from the
    // generic-fallback body so the user's home directory layout
    // doesn't end up on screen / in screenshots.
    body: stripFilesystemPaths(message) || 'No additional details available.',
    action: { label: 'Retry', intent: 'retry' },
  };
}

/** Replace any token that looks like an absolute path (POSIX or
 *  Windows) with a `<path>` placeholder. Conservative: only matches
 *  paths that start with `/`, `~/`, or a drive letter. */
function stripFilesystemPaths(message: string): string {
  // POSIX absolute or home-relative
  let out = message.replace(/(?<![\w/])(?:~\/|\/)[^\s'"<>]*[A-Za-z0-9_\-.]/g, '<path>');
  // Windows drive-letter paths: C:\foo or C:/foo
  out = out.replace(/(?<![\w])[A-Za-z]:[\\/][^\s'"<>]+/g, '<path>');
  return out;
}
