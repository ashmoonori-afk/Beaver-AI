# Beaver AI — Overview

> Fully autonomous development orchestrator. A local CLI harness drives multiple LLM agents through plan → execute → review → integrate loops, pausing only at well-defined user checkpoints.

**Doc type:** overview
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [decisions/locked.md](decisions/locked.md), [architecture/overview.md](architecture/overview.md)

---

## What it is

Given a high-level goal (e.g., "build a TypeScript TODO app with auth"), Beaver AI produces a working project. It does so by:

1. **Planning** the work as a versioned DAG of tasks. See [models/plan-format.md](models/plan-format.md).
2. **Spawning** specialized agents (planner, coder, reviewer, tester, integrator, summarizer), each running in an isolated git worktree, backed by an external LLM CLI (Claude Code, Codex) or a direct API call. See [architecture/agent-runtime.md](architecture/agent-runtime.md).
3. **Driving** them through coding / patching / review / improvement loops automatically, governed by a deterministic top-level state machine. See [architecture/orchestrator.md](architecture/orchestrator.md).
4. **Surfacing** progress at well-defined checkpoints — plan approval, budget exceeded, merge conflicts, final review — so the user is never surprised. See [architecture/feedback-channel.md](architecture/feedback-channel.md).
5. **Reporting** completion with a derived summary and the merged repository.

## What it isn't

- Not a chat assistant — between checkpoints it runs autonomously.
- Not built on top of another agent framework — Beaver *is* the orchestrator. (See decision D6 in [decisions/locked.md](decisions/locked.md).)
- Not cloud-hosted (initially) — runs locally; state lives under `.beaver/` inside the user's repo.

## Core differentiators

- **Multi-LLM orchestration** — picks the right provider per task by capability + cost.
- **Resumable** — every step persisted to an event log; `beaver resume <run-id>` rebuilds state from disk.
- **Accountable autonomy** — hard budget cap pauses the run rather than aborting silently. See [models/cost-budget.md](models/cost-budget.md).
- **Single-package distribution** — one npm package gives both `import { Beaver }` and the `beaver` CLI binary.
