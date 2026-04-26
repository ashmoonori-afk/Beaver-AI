# Agent Runtime

> Spawns, supervises, and tears down role-based agents. Each agent is bound to one task, one worktree, and one provider.

**Doc type:** architecture
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [architecture/orchestrator.md](orchestrator.md), [architecture/provider-adapters.md](provider-adapters.md), [architecture/workspace-state.md](workspace-state.md), [models/cost-budget.md](../models/cost-budget.md), [models/sandbox-policy.md](../models/sandbox-policy.md), [models/agent-baseline.md](../models/agent-baseline.md)

---

## Definition

An **agent** is a runtime instance of:

```
(provider, role, prompt template, tool budget, worktree)
```

It exists for the lifetime of a single task attempt. Retries spawn a fresh agent.

## Roles

| Role | Purpose |
|------|---------|
| `planner` | Turns a goal into a [Plan](../models/plan-format.md) (a versioned task DAG). |
| `coder` | Implements one task inside its worktree, committing to its branch. |
| `reviewer` | Diffs a coder's branch against `main`, scores against acceptance criteria, files findings. |
| `tester` | Generates and runs tests; parses pass/fail output. |
| `integrator` | Merges agent branches in dependency order; escalates non-trivial conflicts. |
| `summarizer` | Produces user-facing progress and final-report documents. |

## Responsibilities

### Lifecycle
- **Spawn** — create a fresh worktree, **build the agent prompt** by concatenating: bundled [agent baseline](../models/agent-baseline.md) → user-level baseline override (if any) → repo's `CLAUDE.md` and/or `AGENTS.md` (if any, additive) → per-role addendum → task prompt with `acceptanceCriteria`. The same canonical baseline is rendered as `CLAUDE.md` for Claude Code agents and `AGENTS.md` for Codex agents (D15 dual-naming). Then invoke the [provider adapter](provider-adapters.md).
- **Supervise** — watch for stdout / events; record to the transcripts directory; bump `lastOutputTs` on every observable signal.
- **Time out / kill** — enforce both the per-role wall-clock limit and the 120 s output-stall watchdog; both produce `RunResult.status = 'timeout'`. Clean up child processes on abort.
- **Tear down** — record final `RunResult`, commit any in-progress work, optionally remove the worktree on success.

### Worktree binding
Every agent receives its own `git worktree` on a dedicated branch named `beaver/<run-id>/<agent-id>`. Worktrees give physical isolation: agents cannot accidentally clobber one another's files. See [architecture/workspace-state.md](workspace-state.md).

### Message bus
Agents do **not** communicate via in-memory IPC. Every cross-agent message is an `event` row in SQLite. This makes runs:

- **Inspectable** — `beaver status` and the dashboard read the same event log.
- **Resumable** — replay rebuilds in-memory state.
- **Auditable** — full conversation history is persisted.

### Cost / budget guard
The runtime enforces per-agent and per-task budgets and reports usage to the run-level aggregator. Soft warnings at 70 %; hard kill at 100 %. Detail in [models/cost-budget.md](../models/cost-budget.md).

### Sandbox / shell policy
Every shell call placed by an agent is classified by the policy engine — hard-deny, require-confirmation, or allow — before execution. The classification produces an `agent.shell` event regardless of verdict. Detail and patterns in [models/sandbox-policy.md](../models/sandbox-policy.md).

### Concurrency, retry, and context handoff
Bounded-parallel scheduling (default 5), failure-typed retry policy (max 2 per task), fresh context with structured dependency summaries. Provider-by-role assignments (Claude Code default; Codex for `coder`/`integrator`). Detail in [models/agent-operations.md](../models/agent-operations.md).

## Example: a `coder` agent run

```
1. Orchestrator picks a ready task and a provider+role.
2. Runtime: git worktree add .beaver/worktrees/<agent-id> beaver/<run>/<agent-id>
3. Runtime: build prompt from task.prompt + acceptanceCriteria.
4. Runtime: ProviderAdapter.run({ workdir, prompt, budget, ... })
5. Adapter spawns claude CLI; pipes stdout; emits agent events.
6. Agent edits files, commits to its branch.
7. Runtime: reads RunResult; persists artifacts and usage; emits 'agent.completed' event.
```
