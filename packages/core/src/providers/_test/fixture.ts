// Fixture format for the mock CLI harness.
// Pure JSON — no scripting (per P1.S1 spaghetti rule).

import fs from 'node:fs';

import { z } from 'zod';

export const FixtureSchema = z.object({
  /** Stable display name. Surfaced in test failures. */
  name: z.string().min(1),
  /** Events the mock CLI emits to stdout in order. Each is one JSONL line. */
  events: z.array(z.unknown()).default([]),
  /** Optional final RunResult-shaped object emitted as the last line. */
  finalResult: z.unknown().optional(),
  /** Exit code the mock CLI exits with. */
  exitCode: z.number().int().default(0),
  /** When set, mock CLI exits 3 if its stdin does not include this substring. */
  expectStdinContains: z.string().optional(),
});
export type Fixture = z.infer<typeof FixtureSchema>;

/** Synchronously load and validate a fixture file. */
export function loadFixture(filePath: string): Fixture {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return FixtureSchema.parse(raw);
}
