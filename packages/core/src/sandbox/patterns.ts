// Sandbox policy pattern table per docs/models/sandbox-policy.md.
//
// Pure data: an ordered array of {id, regex, verdict, reason}. The
// classifier walks this array in order and the first hit wins, so
// hard-deny patterns precede require-confirmation patterns.
//
// Patterns here are regex-only and operate on the raw cmd string.
// Path-aware checks (write outside worktree, resolved rm-rf targets)
// live in classify.ts because they need cwd + worktreePath context.

export type Verdict = 'allow' | 'require-confirmation' | 'hard-deny';

export interface Pattern {
  readonly id: string;
  readonly regex: RegExp;
  readonly verdict: Verdict;
  readonly reason: string;
}

export const PATTERNS: ReadonlyArray<Pattern> = [
  // ───── hard-deny ─────

  {
    id: 'sudo',
    regex: /^\s*(sudo|su)(\s|$)/,
    verdict: 'hard-deny',
    reason: 'privilege escalation forbidden',
  },
  {
    // Literal root targets only. Children of $HOME / ~ that are NOT the root
    // itself (e.g. ~/.ssh/id_rsa, ~/.config/beaver) are handled by the
    // credential-paths and beaver-user-config patterns below; resolved targets
    // (cd / && rm -rf .) are handled by the path-aware check in classify.ts.
    id: 'rm-rf-system',
    regex: /\brm\s+-[rRf]+\s+(\/(\s|$)|\$HOME\/?(\s|$)|~\/?(\s|$))/,
    verdict: 'hard-deny',
    reason: 'system-level destruction',
  },
  {
    id: 'credential-paths',
    regex: /(^|[\s=:'"])(~|\$HOME)\/\.(ssh|aws|gnupg)(\/|\s|$)/,
    verdict: 'hard-deny',
    reason: 'credential paths off-limits',
  },
  {
    id: 'beaver-user-config',
    regex: /(~|\$HOME)\/\.config\/beaver(\/|\s|$)/,
    verdict: 'hard-deny',
    reason: 'self-modification (user-level beaver config)',
  },
  {
    id: 'beaver-repo-state',
    regex: /(^|[\s/'"])\.beaver(\/|\s|$)/,
    verdict: 'hard-deny',
    reason: 'self-modification (.beaver/ ledger)',
  },
  {
    id: 'git-push',
    regex: /^\s*git\s+push(\s|$)/,
    verdict: 'hard-deny',
    reason: 'pushing to remote reserved to user',
  },
  {
    id: 'fork-bomb',
    regex: /:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:[^}]*&\s*[^}]*\}\s*;\s*:/,
    verdict: 'hard-deny',
    reason: 'obvious malice (fork bomb)',
  },

  // ───── require-confirmation ─────

  {
    id: 'rm-wildcard',
    regex: /\brm\s+-[rRf]+\s+\S*\*/,
    verdict: 'require-confirmation',
    reason: 'broad blast radius (wildcard rm)',
  },
  {
    id: 'npm-install-pkg',
    regex: /^\s*(npm|pnpm|yarn|bun)\s+(install|add|i)\s+\S/,
    verdict: 'require-confirmation',
    reason: 'supply-chain risk (no publisher allowlist in v0.1)',
  },
  {
    id: 'pip-install-pkg',
    regex: /^\s*(pip|pip3)\s+install\s+\S/,
    verdict: 'require-confirmation',
    reason: 'supply-chain risk (no publisher allowlist in v0.1)',
  },
  {
    id: 'remote-code-pipe',
    regex: /\b(curl|wget)\b[^|]*\|\s*(sh|bash|zsh|ksh)\b/,
    verdict: 'require-confirmation',
    reason: 'remote code piped to shell',
  },
  {
    id: 'remote-code-chmod',
    regex: /\b(curl|wget)\b.*&&\s*chmod\s+\+x/,
    verdict: 'require-confirmation',
    reason: 'remote download then made executable',
  },
  {
    id: 'prisma-migrate',
    regex: /\bprisma\s+migrate\s+(deploy|reset|push)\b/,
    verdict: 'require-confirmation',
    reason: 'persistent db change (prisma migrate)',
  },
  {
    id: 'alembic-upgrade',
    regex: /\balembic\s+upgrade\b/,
    verdict: 'require-confirmation',
    reason: 'persistent db change (alembic upgrade)',
  },
  {
    id: 'rake-db-migrate',
    regex: /\brake\s+db:migrate\b/,
    verdict: 'require-confirmation',
    reason: 'persistent db change (rake db:migrate)',
  },
  {
    id: 'django-migrate',
    regex: /\bmanage\.py\s+migrate\b/,
    verdict: 'require-confirmation',
    reason: 'persistent db change (django manage.py migrate)',
  },
];
