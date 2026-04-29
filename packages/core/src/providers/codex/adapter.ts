// CodexAdapter — production adapter that satisfies the ProviderAdapter
// contract by spawning the `codex` CLI.
//
// Wiring: _shared/spawn.ts (process) + parse.ts (translation) +
// _shared/kill.ts (signals) + budget/cost.ts (USD) + shim-install.ts
// (PATH-shim sandbox enforcement on POSIX).
//
// The post-run filesystem audit (audit.ts -> agent.shell.bypass-attempt)
// is intentionally NOT called from here — it is an orchestrator-level
// concern that runs at run-finalization time when the orchestrator
// already has the runId / runStartedAt context the audit needs. The
// adapter exposes the timing it observed via `RunResult` so the
// orchestrator can drive the audit immediately after.

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

import { killGracefully } from '../_shared/kill.js';
import { spawnAdapterCli } from '../_shared/spawn.js';

import { parseLine, toAgentEvent } from './parse.js';
import { installShim } from './shim-install.js';

const SUMMARY_MAX_CHARS = 500;
const ZERO_USAGE: Usage = { tokensIn: 0, tokensOut: 0, model: '?' };

export interface CodexAdapterOptions {
  /** Path to the `codex` executable. Tests inject `process.execPath`. */
  cliPath?: string;
  /** Default arg list; tests inject `[mockCliPath, fixturePath]`. */
  defaultArgs?: string[];
  /** SQLite connection for rate_table lookups. */
  db: Db;
  /** Provider key in rate_table. Defaults to 'codex'. */
  providerForRate?: string;
  /** When true, install the PATH shim into <workdir>/.beaver/shim/ before
   *  spawning Codex and prepend that dir to the spawned env's PATH. v0.1
   *  POSIX-only — installShim throws on Windows. */
  installShim?: boolean;
  /** Path to classify-cli.ts (passed to installShim when installShim:true). */
  classifyCliPath?: string;
}

export class CodexAdapter implements ProviderAdapter {
  readonly name = 'codex';
  readonly capabilities: Capabilities = ['file-edit', 'sandbox', 'streaming'];

  constructor(private readonly opts: CodexAdapterOptions) {}

  cost(usage: Usage): CostEstimate {
    return computeCost(this.opts.db, usage, {
      provider: this.opts.providerForRate ?? this.name,
    });
  }

  async run(opts: RunOptions): Promise<RunResult> {
    const cliPath = this.opts.cliPath ?? 'codex';
    // Real `codex` CLI runs non-interactively via `codex exec --json` +
    // the prompt as the last positional arg. Tests inject defaultArgs
    // (mock-cli + fixture) and that path bypasses these production defaults.
    const productionMode = this.opts.defaultArgs === undefined;
    // v0.2.2 — `--skip-git-check` and `--ask-for-approval never`
    // surface as no-ops on older codex builds but on recent releases
    // they suppress the "trust this directory? [y/N]" prompt that
    // was hanging beaver runs in a fresh workspace. The escape hatch
    // BEAVER_CODEX_EXTRA_ARGS (space-separated) lets users append
    // any version-specific flag (e.g.
    // `--dangerously-bypass-approvals-and-sandbox`) without a code
    // change.
    const extraEnvArgs = (process.env['BEAVER_CODEX_EXTRA_ARGS'] ?? '')
      .split(/\s+/)
      .filter((s) => s.length > 0);
    const args = productionMode
      ? [
          'exec',
          '--json',
          '--full-auto',
          '--ask-for-approval',
          'never',
          '--skip-git-check',
          '--sandbox',
          'workspace-write',
          ...extraEnvArgs,
        ]
      : [...(this.opts.defaultArgs ?? [])];
    const transcriptPath = path.join(opts.workdir, '.beaver-transcript.jsonl');

    const transcript: AgentEvent[] = [];
    const textChunks: string[] = [];
    let totalUsage: Usage = { ...ZERO_USAGE };
    let timedOut = false;
    let budgetExceeded = false;

    if (productionMode) {
      const fullPrompt = (opts.systemPrompt ? opts.systemPrompt + '\n\n' : '') + opts.prompt;
      args.push(fullPrompt);
    }
    // stdin is only piped on the test path; production uses the prompt arg.
    const stdin = productionMode
      ? undefined
      : (opts.systemPrompt ? opts.systemPrompt + '\n\n' : '') + opts.prompt;

    // Optional PATH-shim install: T2/T3. The shim wraps `rm`/`curl`/...
    // and routes them through classify-cli before exec'ing the real binary.
    let env: NodeJS.ProcessEnv | undefined;
    if (this.opts.installShim) {
      if (!this.opts.classifyCliPath) {
        throw new Error('CodexAdapter: installShim:true requires classifyCliPath');
      }
      const { shimDir } = installShim({
        workdir: opts.workdir,
        classifyCliPath: this.opts.classifyCliPath,
      });
      const sep = process.platform === 'win32' ? ';' : ':';
      env = {
        PATH: `${shimDir}${sep}${process.env.PATH ?? ''}`,
        BEAVER_WORKTREE: opts.workdir,
        BEAVER_CWD: opts.workdir,
      };
    }

    const spawned = spawnAdapterCli({
      cliPath,
      args,
      cwd: opts.workdir,
      ...(stdin !== undefined && { stdin }),
      ...(env !== undefined && { env }),
      ...(opts.signal !== undefined && { signal: opts.signal }),
    });

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
        } else if (stream.type === 'output_delta') {
          textChunks.push(stream.text);
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      opts.signal?.removeEventListener('abort', abortListener);
    }

    const exitCode = await spawned.exit;

    const status: RunStatus = budgetExceeded
      ? 'budget_exceeded'
      : timedOut
        ? 'timeout'
        : opts.signal?.aborted
          ? 'aborted'
          : exitCode === 0
            ? 'ok'
            : 'failed';

    writeFileSync(
      transcriptPath,
      transcript.map((e) => JSON.stringify(e)).join('\n') + (transcript.length ? '\n' : ''),
      'utf8',
    );

    const stderr = spawned.stderr();
    const summary =
      textChunks.join('').slice(0, SUMMARY_MAX_CHARS) ||
      (stderr.length > 0 ? stderr.slice(0, SUMMARY_MAX_CHARS) : `status=${status}`);
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
