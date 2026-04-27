// Idempotent installer for Beaver's Codex PATH-shim sandbox.
//
// Copies the bundled POSIX shim scripts (providers/codex/shim/<name>) into
// `<workdir>/.beaver/shim/`, sets the executable bit, and writes a meta
// JSON file recording which classify-cli invocation the shims were
// installed against. A second install with the same classifyCliPath is a
// no-op (returns installed: []).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUNDLED_SHIM_DIR = path.join(HERE, 'shim');
const META_FILENAME = '.beaver-shim-meta.json';
const CMD_FILENAME = '.beaver-classify-cmd';

export const SHIM_COMMANDS = ['rm', 'curl', 'wget', 'npm', 'pip', 'sudo', 'git'] as const;
export type ShimCommand = (typeof SHIM_COMMANDS)[number];

export interface ShimInstallOptions {
  workdir: string;
  /** Absolute path to classify-cli.ts. Wrapped as `node --import=tsx <path>`. */
  classifyCliPath: string;
}

export interface ShimInstallResult {
  shimDir: string;
  installed: string[];
}

interface ShimMeta {
  classifyCliCommand: string;
  installedAt: string;
}

function buildClassifyCommand(classifyCliPath: string): string {
  return `node --import=tsx --no-warnings ${JSON.stringify(classifyCliPath)}`;
}

function readMeta(metaPath: string): ShimMeta | null {
  if (!fs.existsSync(metaPath)) return null;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (raw && typeof raw === 'object' && 'classifyCliCommand' in raw) {
      return raw as ShimMeta;
    }
    return null;
  } catch {
    return null;
  }
}

export function installShim(opts: ShimInstallOptions): ShimInstallResult {
  if (process.platform === 'win32') {
    throw new Error(
      'installShim: Windows is not supported in v0.1 (POSIX shell shims only). ' +
        'See packages/core/src/providers/codex/shim/README.md for the v0.2 ' +
        'OS-level sandbox roadmap.',
    );
  }

  const shimDir = path.join(opts.workdir, '.beaver', 'shim');
  fs.mkdirSync(shimDir, { recursive: true });

  const classifyCmd = buildClassifyCommand(opts.classifyCliPath);
  const metaPath = path.join(shimDir, META_FILENAME);
  const existing = readMeta(metaPath);
  if (existing && existing.classifyCliCommand === classifyCmd) {
    return { shimDir, installed: [] };
  }

  const installed: string[] = [];
  for (const name of SHIM_COMMANDS) {
    const src = path.join(BUNDLED_SHIM_DIR, name);
    const dst = path.join(shimDir, name);
    fs.copyFileSync(src, dst);
    fs.chmodSync(dst, 0o755);
    installed.push(name);
  }

  fs.writeFileSync(path.join(shimDir, CMD_FILENAME), classifyCmd, 'utf8');
  const meta: ShimMeta = {
    classifyCliCommand: classifyCmd,
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  return { shimDir, installed };
}
