// Test helper that drives the mock CLI as a real child process and
// asserts the captured event stream matches the fixture's expected order.
// Used from both P1.S1 self-tests and (later) P1.S2 ClaudeCodeAdapter
// integration tests.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFixture, type Fixture } from './fixture.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOCK_CLI = path.join(HERE, 'mock-cli.js');

export interface RunWithMockCliOptions {
  fixturePath: string;
  /** Optional bytes to write to mock-cli stdin. stdin is closed after. */
  stdin?: string;
  /** When true, fixtures missing finalResult are accepted (truncated runs). */
  allowPartial?: boolean;
}

export interface MockCliRunResult {
  fixture: Fixture;
  events: unknown[];
  finalResult: unknown | null;
  exitCode: number;
  stderr: string;
}

export async function runWithMockCli(opts: RunWithMockCliOptions): Promise<MockCliRunResult> {
  const fixture = loadFixture(opts.fixturePath);

  if (!opts.allowPartial && fixture.finalResult === undefined) {
    throw new Error(`fixture truncated: ${fixture.name} has no finalResult`);
  }

  return await new Promise<MockCliRunResult>((resolve, reject) => {
    const child = spawn(process.execPath, [MOCK_CLI, opts.fixturePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (opts.stdin !== undefined) child.stdin.write(opts.stdin);
    child.stdin.end();

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));
    child.on('error', reject);
    child.on('exit', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const lines = stdout.split('\n').filter((l) => l.length > 0);

      const events: unknown[] = [];
      let finalResult: unknown | null = null;
      for (const line of lines) {
        const parsed: unknown = JSON.parse(line);
        if (
          parsed !== null &&
          typeof parsed === 'object' &&
          (parsed as Record<string, unknown>).kind === 'final'
        ) {
          finalResult = (parsed as { result: unknown }).result;
        } else {
          events.push(parsed);
        }
      }

      // Assert event order matches fixture.events. T3 verify.
      const expectedJson = JSON.stringify(fixture.events);
      const actualJson = JSON.stringify(events);
      if (expectedJson !== actualJson) {
        reject(
          new Error(
            `event mismatch in fixture ${fixture.name}\n  expected: ${expectedJson}\n  actual:   ${actualJson}`,
          ),
        );
        return;
      }

      resolve({ fixture, events, finalResult, exitCode: code ?? 0, stderr });
    });
  });
}
