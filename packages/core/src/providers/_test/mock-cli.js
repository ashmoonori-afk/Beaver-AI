#!/usr/bin/env node
// Mock CLI for adapter integration tests. Self-contained — does NOT
// import anything from real adapters (per P1.S1 spaghetti rule).
//
// Usage:
//   node mock-cli.js <fixture.json>
//
// Behavior:
//   - reads stdin to end (lets the parent close the pipe cleanly).
//   - if fixture.expectStdinContains is set and the substring is missing,
//     exits 3 with a clear stderr message.
//   - emits each event from fixture.events as one JSONL line on stdout,
//     in order, synchronously.
//   - if fixture.finalResult is set, emits one final JSONL line
//     {"kind":"final","result":...} after the events.
//   - exits with fixture.exitCode (default 0).

import fs from 'node:fs';

const fixturePath = process.argv[2];
if (!fixturePath) {
  process.stderr.write('mock-cli: fixture path required as arg 1\n');
  process.exit(2);
}

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const stdin = Buffer.concat(chunks).toString('utf8');

  if (
    typeof fixture.expectStdinContains === 'string' &&
    !stdin.includes(fixture.expectStdinContains)
  ) {
    process.stderr.write(
      `mock-cli: stdin missing expected substring "${fixture.expectStdinContains}"\n`,
    );
    process.exit(3);
  }

  for (const event of fixture.events ?? []) {
    process.stdout.write(JSON.stringify(event) + '\n');
  }
  if (fixture.finalResult !== undefined) {
    process.stdout.write(JSON.stringify({ kind: 'final', result: fixture.finalResult }) + '\n');
  }
  process.exit(fixture.exitCode ?? 0);
});
