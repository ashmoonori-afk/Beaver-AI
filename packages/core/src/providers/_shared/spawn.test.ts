import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { spawnAdapterCli } from './spawn.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, '..', '_test', 'mock-cli.js');
const FX_DIR = path.join(HERE, '..', '_test', 'fixtures');

describe('spawnAdapterCli', () => {
  it('yields one line per stdout chunk for the claude-normal fixture', async () => {
    const { lines, exit } = spawnAdapterCli({
      cliPath: process.execPath,
      args: [MOCK_CLI, path.join(FX_DIR, 'claude-normal.json')],
    });
    const out: string[] = [];
    for await (const line of lines) out.push(line);
    expect(await exit).toBe(0);
    // 6 protocol events + 1 mock-cli terminator
    expect(out).toHaveLength(7);
    expect(JSON.parse(out[0]!).type).toBe('message_delta');
    expect(JSON.parse(out[6]!).kind).toBe('final');
  });

  it('captures stderr separately from stdout', async () => {
    const { lines, exit, stderr } = spawnAdapterCli({
      cliPath: process.execPath,
      // mock-cli demands stdin substring; without it -> exit 3 + stderr message
      args: [MOCK_CLI, path.join(FX_DIR, 'stdin-required.json')],
    });
    const out: string[] = [];
    for await (const line of lines) out.push(line);
    expect(await exit).toBe(3);
    expect(out).toHaveLength(0);
    expect(stderr()).toContain('mock-cli: stdin missing');
  });
});
