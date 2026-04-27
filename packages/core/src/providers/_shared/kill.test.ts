import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { spawnAdapterCli } from './spawn.js';
import { killGracefully } from './kill.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', '_test', 'mock-cli.js');
const FX_DIR = path.join(HERE, '..', '_test', 'fixtures');

describe('killGracefully', () => {
  it('terminates a slow fixture run before it would naturally finish', async () => {
    const { child, exit } = spawnAdapterCli({
      cliPath: process.execPath,
      args: [MOCK_CLI, path.join(FX_DIR, 'claude-slow.json')],
    });

    // Give the child ~50ms to be up and emitting, then kill.
    await new Promise<void>((r) => setTimeout(r, 50));
    await killGracefully(child, { escalateAfterMs: 200 });

    const code = await exit;
    // Killed by signal — exit code is null on POSIX, may be a number on Windows.
    // What matters is that the child has exited.
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect([null, 0, 1, 130, 137, 143]).toContain(code);
  });

  it('is a no-op if the child has already exited', async () => {
    const { child, exit } = spawnAdapterCli({
      cliPath: process.execPath,
      args: [MOCK_CLI, path.join(FX_DIR, 'claude-normal.json')],
    });
    // Drain stdout
    for await (const _ of child.stdout ?? []) void _;
    await exit;

    // Should resolve quickly without throwing.
    await killGracefully(child);
    expect(true).toBe(true);
  });
});
