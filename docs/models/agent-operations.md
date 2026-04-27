# Agent Operations Policy

> How agents are scheduled, retried, assigned to providers, and handed context. The operational primitives the orchestrator uses every loop.

**Doc type:** model
**Status:** Locked (D10)
**Last updated:** 2026-04-27 (watchdog edge cases and default rationale added)
**See also:** [decisions/locked.md](../decisions/locked.md) (D10), [architecture/orchestrator.md](../architecture/orchestrator.md), [architecture/agent-runtime.md](../architecture/agent-runtime.md), [architecture/provider-adapters.md](../architecture/provider-adapters.md)

---

## Concurrency

- **Model:** bounded parallel.
- **Default:** `maxParallelAgents = 5`.
- **Eligibility:** any task whose `dependsOn` ids are all `completed` is *ready*. The orchestrator picks up to `maxParallelAgents` ready tasks and dispatches each to its own agent + worktree.
- **Override:** `.beaver/config.json` → `agentOps.maxParallelAgents`.
- **Why bounded:** unlimited parallelism risks API rate limits, multiplies cost variance, and makes transcripts unreadable. Five is a balance between speed and observability for a single-user local tool.

## Retry & escalation

Failure is not one thing — different `RunResult.status` values get different policies.

| Failure type | Meaning | Action |
|--------------|---------|--------|
| `timeout` | Agent exceeded its wall-clock **or** triggered the stall watchdog (see below) | Retry once. Counts toward the per-task retry cap. |
| `invalid_output` | zod validation failed on agent output | Retry once with self-repair prompt. Counts toward the per-task retry cap. |
| `budget_exceeded` | Agent hit its USD cap | No retry. Handled by the budget model — see [cost-budget](cost-budget.md). |
| `agent_unable` | Agent reported "I cannot complete this" | No retry. Escalate immediately to user via `escalation` checkpoint. |
| `reviewer_reject` | Reviewer marked output as failing acceptance criteria | Retry up to 2 times with reviewer findings injected; then escalate. |

**Per-task retry cap:** **2** retries (3 attempts total). Counted against `timeout`, `invalid_output`, and `reviewer_reject` together.

**Backoff:** none for application-level failures (LLM nondeterminism is not transient). 429 / rate-limit errors are absorbed inside the provider adapter with exponential backoff and do not count toward the retry cap.

## Provider / model matrix

The v0.1 prototype is **CLI-only** for consistency, simpler debugging, and a single integration story to verify end-to-end.

| Role | Provider | Notes |
|------|----------|-------|
| `planner` | Claude Code CLI | Structured plan output validated against [PlanSchema](plan-format.md). |
| `coder` | **Codex CLI** | Heavy file edits and tool use. |
| `reviewer` | Claude Code CLI | Diff review, acceptance scoring. |
| `tester` | Claude Code CLI | Runs tests in worktree. (Role itself deferred past v0.1 MVP.) |
| `integrator` | **Codex CLI** | Merge conflict resolution. (Role itself deferred past v0.1 MVP.) |
| `summarizer` | Claude Code CLI | Final-report writer. |
| Orchestrator sub-decisions | Claude Code CLI | Short structured-JSON calls; CLI startup overhead accepted for prototype consistency. |

**Tier:** all roles default to **Balanced** tier (Sonnet-class). Override per task via `Task.providerHint` or per role via config. Premium tier (Opus-class) is opt-in only, never default.

**No direct-API adapters in v0.1.** `AnthropicApiAdapter` / `OpenAiApiAdapter` are deferred. v0.2 may reintroduce direct API for orchestrator sub-decisions if CLI startup latency proves intolerable.

## Context handoff

When the orchestrator dispatches a new agent, the agent receives:

1. The task's `prompt` and `acceptanceCriteria` (from the [plan](plan-format.md)).
2. The current run goal.
3. **Structured summaries** of each task in `dependsOn` — produced by the dependency task's reviewer or summarizer.
4. The path to its worktree.

Agents do **not** receive raw transcripts of prior agents. This keeps context windows bounded and forces upstream agents to hand off what matters in a structured form.

The summarizer's existence in v0.1 (even before integrator/tester land) is partly motivated by this — a final summary feeds the user, but intermediate summaries feed downstream agents.

## Wall-clock timeout defaults

| Role | Default timeout |
|------|-----------------|
| `planner` | 5 min |
| `coder` | 30 min |
| `reviewer` | 10 min |
| `tester` | 20 min |
| `integrator` | 15 min |
| `summarizer` | 5 min |

Override via `.beaver/config.json` → `agentOps.timeoutMinutes.<role>`.

These are initial defaults, not measured constants. They are sized for the reference TODO-app flow and will be revisited after the first 10 real reference runs; until then, overrides are the supported escape hatch for unusually slow builds.

## Stall detection (output watchdog)

Wall-clock alone leaves a stuck agent burning its full budget before being killed. To catch hangs early without OS-level instrumentation, the runtime tracks `lastOutputTs` per agent (every `agent.shell` event, every stdout/stderr chunk, every API stream token bumps it).

| Setting | Value |
|---------|-------|
| **Stall threshold** | 120 seconds with no observable output |
| **Check cadence** | Every 10 seconds |
| **Action on stall** | Kill the agent; produce `RunResult.status = 'timeout'`; counts toward the per-task retry cap. |

The watchdog is intentionally simple — it does not distinguish "LLM thinking" from "process hung" because in CLI mode every LLM token produces output. False positives are rare; if observed, the threshold is overridable.

Edge cases:

| Scenario | Treatment |
|----------|-----------|
| Long build/test process emits stdout or stderr periodically | Each chunk bumps `lastOutputTs`; no stall. |
| Long build/test process is silent for >120 s | Treated as stalled in v0.1. Agents should prefer verbose build/test flags when available. |
| Shell command is started and then produces no output because stdout is buffered | Still treated as stalled; v0.1 favors bounded autonomy over waiting indefinitely. |
| Wall-clock timeout and stall threshold would both fire | The first observed timeout wins; both map to `RunResult.status = 'timeout'` and the same retry budget. |

Override via `.beaver/config.json` → `agentOps.stallThresholdSeconds`.

## Resource limits (deferred to v0.2)

v0.1 relies on **OS defaults plus wall-clock and stall watchdogs**. No CPU / memory / FD ulimits are set on child processes — legitimate builds and test suites must not be artificially constrained at this stage. v0.2 will add resource enforcement together with the OS-level sandbox (`sandbox-exec` on macOS, `bubblewrap` on Linux), where rlimits and cgroup constraints can be applied uniformly.

## Other deferrals to v0.2+

- **Priority / preemption** — critical-path-first scheduling. v0.1 uses FIFO among ready tasks.
- **Cost-based provider routing** (Q7) — dynamic provider selection by capability + cost.

## Configuration surface

```jsonc
// .beaver/config.json (excerpt)
{
  "agentOps": {
    "maxParallelAgents": 5,
    "retriesPerTask": 2,
    "timeoutMinutes": {
      "planner": 5,
      "coder": 30,
      "reviewer": 10,
      "tester": 20,
      "integrator": 15,
      "summarizer": 5
    },
    "providerByRole": {
      "planner": "claude-code",
      "coder": "codex",
      "reviewer": "claude-code",
      "tester": "claude-code",
      "integrator": "codex",
      "summarizer": "claude-code"
    },
    "defaultTier": "balanced",
    "stallThresholdSeconds": 120
  }
}
```
