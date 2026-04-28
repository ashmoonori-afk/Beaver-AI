import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import { runWithMockCli } from './run-with-mock-cli.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fx = (name: string): string => path.join(HERE, 'fixtures', name);

describe('runWithMockCli', () => {
  it('replays the happy fixture and returns events + finalResult', async () => {
    const r = await runWithMockCli({ fixturePath: fx('happy.json') });
    expect(r.exitCode).toBe(0);
    expect(r.events).toHaveLength(2);
    expect(r.finalResult).toMatchObject({ status: 'ok' });
    expect(r.stderr).toBe('');
  });

  it('rejects a fixture without finalResult by default ("fixture truncated")', async () => {
    await expect(runWithMockCli({ fixturePath: fx('truncated.json') })).rejects.toThrow(
      /fixture truncated/,
    );
  });

  it('accepts a partial fixture when allowPartial is true', async () => {
    const r = await runWithMockCli({
      fixturePath: fx('truncated.json'),
      allowPartial: true,
    });
    expect(r.exitCode).toBe(0);
    expect(r.events).toHaveLength(1);
    expect(r.finalResult).toBeNull();
  });

  it('passes stdin through to mock-cli (expectStdinContains satisfied)', async () => {
    const r = await runWithMockCli({
      fixturePath: fx('stdin-required.json'),
      stdin: 'here is the secret-prompt for you',
    });
    expect(r.exitCode).toBe(0);
    expect(r.events).toHaveLength(1);
  });

  it('detects mismatch when stdin causes mock-cli to abort early (no events)', async () => {
    // Without stdin, mock-cli exits 3 and emits no events. The helper compares
    // [] against fixture.events (1 entry) and throws an event-mismatch error.
    await expect(runWithMockCli({ fixturePath: fx('stdin-required.json') })).rejects.toThrow(
      /event mismatch/,
    );
  });

  it('runs 100 sequential happy replays with identical results (no flake)', async () => {
    const expected = await runWithMockCli({ fixturePath: fx('happy.json') });
    const expectedJson = JSON.stringify({
      events: expected.events,
      finalResult: expected.finalResult,
    });

    for (let i = 0; i < 100; i++) {
      const r = await runWithMockCli({ fixturePath: fx('happy.json') });
      const actualJson = JSON.stringify({ events: r.events, finalResult: r.finalResult });
      expect(actualJson).toBe(expectedJson);
    }
    // Generous timeout: 100 child-process spawns on Windows can run
    // ~3-5x slower than on Linux CI. 60s gives headroom on both.
  }, 60_000);
});
