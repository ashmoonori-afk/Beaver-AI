#!/usr/bin/env node
// Copy the build-time Node binary into `packages/cli/dist/node[.exe]`
// so the desktop installer can ship a self-contained sidecar and end
// users don't need a system-installed Node.
//
// Implementation: `process.execPath` points at the Node currently
// running this script. On CI runners (`setup-node@v4`) this is the
// official Node distribution from nodejs.org — already signed where
// applicable. We `fs.realpathSync` first so nvm-style symlinks
// resolve to a real binary, then `chmod +x` on POSIX.
//
// Local builds inherit whatever Node the developer has installed.
// That's fine for smoke testing; CI is what produces the artefact
// the user actually downloads.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');

function main() {
  if (!fs.existsSync(DIST)) {
    fs.mkdirSync(DIST, { recursive: true });
  }
  // Resolve symlinks so we copy the real Node binary, not a shim.
  const src = fs.realpathSync(process.execPath);
  const targetName = process.platform === 'win32' ? 'node.exe' : 'node';
  const dest = path.join(DIST, targetName);

  fs.copyFileSync(src, dest);
  if (process.platform !== 'win32') {
    fs.chmodSync(dest, 0o755);
  }
  const size = fs.statSync(dest).size;
  console.log(
    `[bundle-node] copied ${src} (${(size / 1024 / 1024).toFixed(1)} MB) -> dist/${targetName}`,
  );
}

main();
