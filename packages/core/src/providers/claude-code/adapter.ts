// ClaudeCodeAdapter — production adapter that satisfies the
// ProviderAdapter contract by spawning the `claude` CLI.
//
// Wiring: spawn.ts (process) + parse.ts (translation) + kill.ts (signals)
// + budget/cost.ts (USD). This file is the only place that knows about all
// four; the underlying modules stay independently testable.

import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { computeCost } from '../../budget/cost.js';
import type { AgentEvent } from '../../types/event.js';
import type {
  Capabilities,
  ProviderAdapter,
  RunOptions,
  RunResult,
  RunStatus,
} from '../../types/provider.js';
import { RunResultSchema } from '../../types/provider.js';
import type { CostEstimate, Usage } from '../../types/usage.js';
import type { Db } from '../../workspace/db.js';

import { killGracefully } from './kill.js';
import { parseLine, toAgentEvent } from './parse.js';
import { spawnClaudeCli } from './spawn.js';

const SUMMARY_MAX_CHARS = 500;
const ZERO_USAGE: Usage = { tokensIn: 0, tokensOut: 0, model: '?' };

export interface ClaudeCodeAdapterOptions {
  /** Path to the `claude` executable. Tests inject `process.execPath`. */
  cliPath?: string;
  /** Default arg list; tests inject `[mockCliPath, fixturePath]`. */
  defaultArgs?: string[];
  /** SQLite connection for rate_table lookups. */
  db: Db;
  /** Provider key in rate_table. Defaults to 'claude-code'. */
  providerForRate?: string;
}

export class ClaudeCodeAdapter implements ProviderAdapter {
  readonly name = 'claude-code';
  readonly capabilities: Capabilities = ['file-edit', 'web', 'sandbox', 'streaming'];

  constructor(private readonly opts: ClaudeCodeAdapterOptions) {}

  cost(usage: Usage): CostEstimate {
    return computeCost(this.opts.db, usage, {
      provider: this.opts.providerForRate ?? this.name,
    });
  }

  async run(opts: RunOptions): Promise<RunResult> {
    const cliPath = this.opts.cliPath ?? 'claude';
    const args = [...(this.opts.defaultArgs ?? [])];
    const transcriptPath = path.join(opts.workdir, '.beaver-transcript.jsonl');

    const transcript: AgentEvent[] = [];
    const textChunks: string[] = [];
    let totalUsage: Usage = { ...ZERO_USAGE };
    let timedOut = false;
    let budgetExceeded = false;

    const stdin = (opts.systemPrompt ? opts.systemPrompt + '\n\n' : '') + opts.prompt;
    const spawned = spawnClaudeCli({ cliPath, args, cwd: opts.workdir, stdin });

    let timeoutId: NodeJS.Timeout | null = null;
    if (opts.timeoutMs !== undefined) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        void killGracefully(spawned.child);
      }, opts.timeoutMs);
    }

    const abortListener = (): void => {
      void killGracefully(spawned.child);
    };
    opts.signal?.addEventListener('abort', abortListener);

    try {
      for await (const line of spawned.lines) {
        const stream = parseLine(line);
        if (!stream) continue;

        const event = toAgentEvent(stream);
        transcript.push(event);
        opts.onEvent?.(event);

        if (stream.type === 'usage') {
          totalUsage = {
            tokensIn: totalUsage.tokensIn + stream.tokensIn,
            tokensOut: totalUsage.tokensOut + stream.tokensOut,
            model: stream.model,
          };
          if (opts.budget) {
            const c = this.cost(totalUsage);
            if (c.usd >= opts.budget.usd) {
              budgetExceeded = true;
              await killGracefully(spawned.child);
              break;
            }
          }
        } else if (stream.type === 'message_delta') {
          textChunks.push(stream.text);
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      opts.signal?.removeEventListener('abort', abortListener);
    }

    await spawned.exit;

    const status: RunStatus = budgetExceeded
      ? 'budget_exceeded'
      : timedOut
        ? 'timeout'
        : opts.signal?.aborted
          ? 'aborted'
          : 'ok';

    writeFileSync(
      transcriptPath,
      transcript.map((e) => JSON.stringify(e)).join('\n') + (transcript.length ? '\n' : ''),
      'utf8',
    );

    const summary = textChunks.join('').slice(0, SUMMARY_MAX_CHARS) || `status=${status}`;
    const usage: Usage = totalUsage.model === '?' ? totalUsage : totalUsage;

    return RunResultSchema.parse({
      status,
      summary,
      artifacts: [],
      usage,
      rawTranscriptPath: transcriptPath,
    });
  }
}
