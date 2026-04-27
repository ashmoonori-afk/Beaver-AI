// Idempotent installer for Beaver's PreToolUse hook in a Claude Code
// project config (`<workdir>/.claude/settings.json`).
//
// We do not depend on real Claude Code's exact hook schema for v0.1 —
// the installer writes a structured object the hook script will read,
// and idempotent re-installs do not duplicate the entry. Real Claude
// Code wiring is a P1.S3 followup.

import fs from 'node:fs';
import path from 'node:path';

export interface HookInstallOptions {
  /** Project / agent worktree where `.claude/settings.json` lives. */
  workdir: string;
  /** Absolute path to hook.ts (the script the adapter will spawn). */
  hookScriptPath: string;
  /** Filename inside .claude/. Defaults to 'settings.json'. */
  settingsFile?: string;
}

export interface HookInstallResult {
  settingsPath: string;
  added: boolean;
}

interface SettingsShape {
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      command: string;
      runtime?: string;
    }>;
  };
  [k: string]: unknown;
}

const DEFAULT_SETTINGS_FILE = 'settings.json';
const DEFAULT_MATCHER = '*';

export function installHook(opts: HookInstallOptions): HookInstallResult {
  const dir = path.join(opts.workdir, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  const settingsPath = path.join(dir, opts.settingsFile ?? DEFAULT_SETTINGS_FILE);

  let settings: SettingsShape = {};
  if (fs.existsSync(settingsPath)) {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (parsed && typeof parsed === 'object') settings = parsed as SettingsShape;
    } catch {
      // Treat unreadable settings as empty — we'll overwrite with a fresh object.
      settings = {};
    }
  }

  const hooks = settings.hooks ?? {};
  const pre = hooks.PreToolUse ?? [];

  const expectedCommand = `node --experimental-strip-types ${opts.hookScriptPath}`;
  const alreadyInstalled = pre.some(
    (h) => h.command === expectedCommand && h.matcher === DEFAULT_MATCHER,
  );

  if (alreadyInstalled) {
    return { settingsPath, added: false };
  }

  pre.push({ matcher: DEFAULT_MATCHER, command: expectedCommand, runtime: 'node' });
  hooks.PreToolUse = pre;
  settings.hooks = hooks;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  return { settingsPath, added: true };
}
