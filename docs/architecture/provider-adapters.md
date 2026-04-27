# Provider Adapters

> One unified `ProviderAdapter` interface in front of every external LLM — CLI-spawned in v0.1, with direct API adapters deferred to v0.2+.

**Doc type:** architecture
**Status:** Draft
**Last updated:** 2026-04-26 (D10 ripple: CLI-only adapter set)
**See also:** [decisions/locked.md](../decisions/locked.md) (D3, D9), [architecture/agent-runtime.md](agent-runtime.md), [models/cost-budget.md](../models/cost-budget.md), [models/sandbox-policy.md](../models/sandbox-policy.md)

---

## Interface

```ts
interface ProviderAdapter {
  name: string;
  capabilities: Capabilities;          // file-edit, web, sandbox, custom-tools, ...
  run(opts: RunOptions): Promise<RunResult>;
  cost(usage: Usage): CostEstimate;    // returns USD; see cost-budget doc
}

interface RunOptions {
  prompt: string;
  workdir: string;                     // path to the agent's worktree
  systemPrompt?: string;
  tools?: ToolSpec[];
  timeoutMs?: number;
  budget?: AgentBudget;
  onEvent?: (event: AgentEvent) => void;
  signal?: AbortSignal;
}

interface RunResult {
  status: 'ok' | 'failed' | 'timeout' | 'aborted' | 'budget_exceeded';
  summary: string;
  artifacts: ArtifactRef[];            // files touched, git refs produced
  usage: Usage;                        // tokens in/out per provider
  finalAssistantMessage?: string;
  rawTranscriptPath: string;           // full log stored for replay
}
```

## Built-in adapters (v0.1, CLI-only per D10)

| Adapter | Mechanism | Purpose |
|---------|-----------|---------|
| `ClaudeCodeAdapter` | spawn `claude` CLI as a child process | Default for `planner`, `reviewer`, `tester`, `summarizer`, and orchestrator sub-decisions. |
| `CodexAdapter` | spawn `codex` CLI as a child process | Used for `coder` (and `integrator` once it lands). |

Per-role assignments are in [models/agent-operations.md](../models/agent-operations.md).

Direct-API adapters (`AnthropicApiAdapter`, `OpenAiApiAdapter`) are deferred to v0.2 — see [planning/mvp-scope.md](../planning/mvp-scope.md).

## Capability matching

The `capabilities` field lets the Orchestrator pick the right adapter for a task without hard-coding provider names. A coder task may declare `capabilitiesNeeded: ['file-edit', 'sandbox']`; the Orchestrator filters adapters whose `capabilities` cover that set, then resolves ties by cost / preference.

Capabilities currently defined:

- `file-edit` — adapter can read/write files in `workdir`.
- `web` — adapter can fetch URLs.
- `sandbox` — adapter restricts shell access by default.
- `custom-tools` — adapter accepts caller-supplied tool specs.
- `streaming` — adapter emits incremental output events.

## Spawn-vs-API policy

v0.1 prototype is **spawn-only** for consistency (D10). The trade-off is well understood:

- **Spawn** reuses the provider CLI's built-in tooling (file edit, sandboxed shell, MCP) and gives a single integration story to debug. Costs: higher per-call latency from CLI startup, less in-process control over tool loops.
- **Direct API** would be lower-latency for short structured calls (orchestrator sub-decisions especially), at the cost of duplicating tool implementations.

v0.2 may reintroduce a direct-API path for orchestrator sub-decisions if measured CLI overhead is unacceptable.

## Sandboxing

Locked as D9. Each adapter is responsible for routing tool / shell calls through Beaver's policy engine before they execute:

- `ClaudeCodeAdapter` — registers a PreToolUse hook script that classifies the call against the policy and writes a `risky-change-confirmation` checkpoint when needed.
- `CodexAdapter` — falls back to a PATH shim covering sensitive commands.

Full policy and per-adapter detail in [models/sandbox-policy.md](../models/sandbox-policy.md).
