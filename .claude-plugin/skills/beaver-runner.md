---
name: beaver-runner
description: Use when the user asks to "run beaver", "drive a beaver run", or wants Beaver AI to autonomously execute a development goal end-to-end. Beaver spawns Claude Code + Codex agents through the plan→execute→review loop with sandbox policy enforcement, USD budget caps, and a SQLite ledger that survives crashes.
---

# Beaver runner

Beaver AI is a local autonomous development orchestrator. It takes a high-level goal and drives multiple LLM agents through plan → execute → review → integrate loops, pausing only at well-defined user checkpoints.

## When to invoke this skill

The user explicitly asks for Beaver, says "let beaver handle this", or wants a multi-agent orchestrated build with policy guardrails. Do NOT invoke for simple one-shot questions Claude can answer directly.

## How to invoke Beaver

From the repo root:

```bash
node packages/cli/src/bin.ts run --no-server "<the goal>"
```

For an interactive terminal session that can answer checkpoint prompts inline:

```bash
node packages/cli/src/bin.ts run --no-server "<the goal>"
```

Subcommands:

- `init` — set up `.beaver/` (idempotent; refuses non-git directories)
- `run "<goal>"` — start a new run (one active run per project)
- `status` — current state, plan version, spent USD, open checkpoints
- `logs --follow` — tail the events table
- `checkpoints` — list pending checkpoints
- `answer <id> <response>` — reply (`approve` / `reject` / `comment <text>`)
- `resume <run-id>` — recover a paused / crashed run from disk
- `abort <run-id>` — stop a run

## Guardrails (always on)

- **Sandbox policy** classifies every shell call as `allow` / `require-confirmation` / `hard-deny` before execution
- **Per-agent / per-task / per-run USD budget** with a hard cap that posts a `budget-exceeded` checkpoint instead of overspending silently
- **Worktree write boundary** — agents work inside isolated git worktrees; writes outside are flagged
- **Append-only event log** in SQLite (WAL mode) so every run is replayable
- **Wall-clock + 120 s output-stall watchdog** kills hung agents

## Reporting back to the user

After invoking, parse the JSON-ish status output and tell the user:

- Final state (COMPLETED / FAILED / ABORTED)
- Spent USD vs cap
- Branch names produced (the run leaves them in place — the user merges manually)
- Any open checkpoints requiring their attention
