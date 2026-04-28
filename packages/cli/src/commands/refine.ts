// `beaver refine "<goal>"` — emit a structured RefinementResult JSON
// for the supplied goal. Used by:
//
//   1. The Tauri desktop shell (4D.2.x) — spawns this as a sidecar
//      and emits the parsed result to the renderer.
//   2. CI and humans inspecting the planner's output.
//
// W.12.2 (real generation) — invokes the LLM via ClaudeCodeAdapter.
// Tests inject a mock-cli fixture via the BEAVER_REFINE_CLI / _ARGS
// env vars (matching the run/init pattern).

import { ClaudeCodeAdapter, makeLlmRefiner } from '@beaver-ai/core';

import { printerr, println, withDb } from './_shared.js';

interface ParsedArgs {
  goal: string;
  priorResponse: string | undefined;
  sectionEdits: Record<string, string>;
}

function parseArgs(args: string[]): ParsedArgs | { error: string } {
  let goal: string | null = null;
  let priorResponse: string | undefined;
  const sectionEdits: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--prior') {
      priorResponse = args[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (a === '--section-edit') {
      // Format: --section-edit "prd:goals=add latency"
      const raw = args[i + 1] ?? '';
      i += 1;
      const eq = raw.indexOf('=');
      if (eq < 0) return { error: `bad --section-edit value: ${raw}` };
      sectionEdits[raw.slice(0, eq)] = raw.slice(eq + 1);
      continue;
    }
    if (a === '--help' || a === '-h') {
      return { error: 'help' };
    }
    if (a !== undefined && !a.startsWith('-') && goal === null) {
      goal = a;
      continue;
    }
    return { error: `unexpected argument: ${a}` };
  }
  if (goal === null) return { error: 'missing required <goal> argument' };
  return { goal, priorResponse, sectionEdits };
}

function printUsage(): void {
  printerr(
    'usage: beaver refine "<goal>" [--prior <response>] [--section-edit <scope:section=text>]',
  );
}

export async function runRefine(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  if ('error' in parsed) {
    if (parsed.error === 'help') {
      printUsage();
      return 0;
    }
    printerr(parsed.error);
    printUsage();
    return 2;
  }

  return withDb(
    async (db) => {
      const adapter = new ClaudeCodeAdapter({
        db,
        ...(process.env['BEAVER_REFINE_CLI'] ? { cliPath: process.env['BEAVER_REFINE_CLI'] } : {}),
        ...(process.env['BEAVER_REFINE_ARGS']
          ? { defaultArgs: JSON.parse(process.env['BEAVER_REFINE_ARGS']) as string[] }
          : {}),
      });
      const refiner = makeLlmRefiner({ adapter });
      try {
        const result = await refiner({
          rawGoal: parsed.goal,
          ...(parsed.priorResponse !== undefined ? { priorResponse: parsed.priorResponse } : {}),
          ...(Object.keys(parsed.sectionEdits).length > 0
            ? { sectionEdits: parsed.sectionEdits }
            : {}),
        });
        println(JSON.stringify(result, null, 2));
        return 0;
      } catch (err) {
        printerr(`refine failed: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
      }
    },
    { migrate: true },
  );
}
