# Architecture — Layer Overview

> Six stacked layers from the user-facing entry surface down to the persistence and feedback channels. Each layer has its own dedicated doc.

**Doc type:** architecture
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [overview.md](../overview.md), [decisions/locked.md](../decisions/locked.md)

---

## The six layers

```
┌──────────────────────────────────────────────────────────────┐
│  Entry Layer            beaver CLI    │    import { Beaver } │
├──────────────────────────────────────────────────────────────┤
│  Orchestrator           Plan → Execute → Review → Integrate  │
│  (the "meta-agent")     FSM-driven, LLM sub-decisions        │
├──────────────────────────────────────────────────────────────┤
│  Agent Runtime          Lifecycle · Worktree binding         │
│                         Message bus · Cost/budget guard      │
├──────────────────────────────────────────────────────────────┤
│  Provider Adapters      Claude Code CLI │ Codex CLI │ API    │
│                         Unified ProviderAdapter interface    │
├──────────────────────────────────────────────────────────────┤
│  Workspace & State      Git worktrees · SQLite ledger        │
│                         Artifacts · Event log · Cost log     │
├──────────────────────────────────────────────────────────────┤
│  Feedback Channel       Terminal prompts · Dashboard server  │
│                         Notifications · Review documents     │
└──────────────────────────────────────────────────────────────┘
```

## Per-layer doc map

| Layer | Doc | One-liner |
|-------|-----|-----------|
| Entry | [entry-layer.md](entry-layer.md) | Two ways to invoke Beaver, sharing the same core. |
| Orchestrator | [orchestrator.md](orchestrator.md) | Deterministic FSM with LLM-driven sub-decisions. |
| Agent Runtime | [agent-runtime.md](agent-runtime.md) | Spawns and supervises role-based agents in worktrees. |
| Provider Adapters | [provider-adapters.md](provider-adapters.md) | Unified `ProviderAdapter` over CLIs and APIs. |
| Workspace & State | [workspace-state.md](workspace-state.md) | `.beaver/` filesystem layout and SQLite schema. |
| Feedback Channel | [feedback-channel.md](feedback-channel.md) | Terminal prompts and web dashboard, one primitive. |

## Cross-cutting concerns

- **Cost & Budget** — enforced at the Agent Runtime layer, persisted in Workspace & State. See [models/cost-budget.md](../models/cost-budget.md).
- **Plan** — produced by the Orchestrator, persisted under `.beaver/runs/<run-id>/plan/`. See [models/plan-format.md](../models/plan-format.md).
- **Events** — every layer writes to the append-only `events` table; the Orchestrator reads from it for resumability.
