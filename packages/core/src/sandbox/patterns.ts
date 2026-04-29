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
  // Phase 2-B — block writes to host disks. We only catch writes
  // (`of=/dev/sd…`); reading raw disks (`if=/dev/sd…`) is sometimes
  // legitimate (taking an image) so it stays as `allow`. Device-name
  // shapes are enumerated explicitly because `(sd|nvme)\b` would fail
  // against `sda` (both `d` and `a` are word chars, no boundary).
  {
    id: 'dd-to-block-device',
    regex:
      /\bdd\s+(?:[a-z]+=\S+\s+)*of=\/dev\/(?:sd[a-z]\d*|nvme\d+n\d+(?:p\d+)?|hd[a-z]\d*|disk\d+(?:s\d+)?|mmcblk\d+(?:p\d+)?|loop\d*)/,
    verdict: 'hard-deny',
    reason: 'destroys a host block device (dd of=/dev/...)',
  },
  // Phase 2-B — redirecting stdout to system paths is almost always
  // catastrophic (overwrite /etc/passwd, scribble on /proc, write to
  // raw block devices). Both `>` (truncate) and `>>` (append) caught.
  {
    id: 'redirect-system-path',
    regex:
      />>?\s*\/(?:etc(?:\/|$|\s)|boot(?:\/|$|\s)|sys(?:\/|$|\s)|proc(?:\/|$|\s)|dev\/(?:sd[a-z]\d*|nvme\d+n\d+(?:p\d+)?|hd[a-z]\d*|disk\d+(?:s\d+)?|mmcblk\d+(?:p\d+)?|loop\d*))/,
    verdict: 'hard-deny',
    reason: 'redirect to a system path (overwrites os state)',
  },
  // Phase 2-B — partition / format tools that scribble on raw devices.
  // Even with no args these prompt-and-then-destroy on real systems
  // (mkfs without -f still asks; we deny anyway).
  {
    id: 'partition-tools',
    regex: /^\s*(mkfs(\.\w+)?|fdisk|parted|wipefs|sgdisk)(\s|$)/,
    verdict: 'hard-deny',
    reason: 'partition / format tool (host-level destruction)',
  },

  // ───── require-confirmation ─────

  // Phase 2-B — chmod 777 (world-writable / world-executable). Almost
  // never the right answer; the normal case `chmod +x build.sh` does
  // not match (octal-only).
  {
    id: 'chmod-world-writable',
    regex: /\bchmod\s+(?:-\S+\s+)*0?777\b/,
    verdict: 'require-confirmation',
    reason: 'world-writable / world-executable mode (chmod 777)',
  },
  // Phase 2-B — eval of remote-fetched output. Sister of the
  // remote-code-pipe pattern; catches `eval "$(curl ...)"` and
  // friends that the pipe regex misses.
  {
    id: 'eval-remote-code',
    regex: /\beval\b[^|]*\$\(\s*(curl|wget)\b/,
    verdict: 'require-confirmation',
    reason: 'eval of remote-fetched output',
  },
  // Phase 2-B — base64-decoded payload piped into a shell. Common
  // obfuscation for remote code execution.
  {
    id: 'base64-pipe-shell',
    regex: /\bbase64\b[^|]*\|\s*(sh|bash|zsh|ksh)\b/,
    verdict: 'require-confirmation',
    reason: 'base64-decoded payload piped to shell (obfuscated remote exec)',
  },

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
