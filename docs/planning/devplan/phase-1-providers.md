# Phase 1 — Providers

> `ClaudeCodeAdapter` and `CodexAdapter` with sandbox enforcement (PreToolUse hook for Claude Code, PATH shim for Codex). First phase that runs external processes.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [conventions.md](conventions.md), [../../architecture/provider-adapters.md](../../architecture/provider-adapters.md), [../../models/sandbox-policy.md](../../models/sandbox-policy.md), [../../models/agent-operations.md](../../models/agent-operations.md)

---

## Phase goal

Two production adapters that satisfy `ProviderAdapter` from P0.S2, route shell calls through the sandbox engine from P0.S4, and enforce per-agent budgets. After this phase, agents can run real LLM CLIs but the orchestrator above them is still stubbed.

## Phase exit criteria

- A tiny end-to-end smoke ("write `hello.txt` containing 'hi'") succeeds via both adapters.
- A hard-deny shell command is blocked and produces an `agent.shell.denied` event.
- A `require-confirmation` shell command writes a `checkpoints` row (no UI yet — verified at the DB).
- Per-agent budget cap aborts the run cleanly (`RunResult.status = 'budget_exceeded'`).

---

## Sprint 1.1: Mock CLI harness

**Goal.** A scriptable fake CLI for fast tests, plus a small abstraction so the adapter can be tested against fake or real binaries.
**Depends on.** P0.S2.

### Tasks
1. T1 — `core/providers/_test/mock-cli.ts` — a Node script that reads stdin, prints scripted events to stdout per a fixture file → verify: harness fixture replay produces deterministic output.
2. T2 — Adapter integration test fixture format: `{ inputs: [...], expectedEvents: [...], finalResult: {...} }` → verify: round-trip with one happy fixture.
3. T3 — `runWithMockCli(adapter, fixturePath)` test helper → verify: fails the test on any unexpected event order.

### Spaghetti test
- The mock CLI does not import anything from real adapters — it is self-contained.
- Fixture files are pure JSON, no scripting.

### Bug test
- Fixture replay completes deterministically across 100 runs (no flake).
- Fixture without `finalResult` reports a useful failure ("fixture truncated").

### Code review checklist
- Harness < 200 lines.
- No use of `setTimeout` for synchronization; use explicit signals.

---

## Sprint 1.2: ClaudeCodeAdapter (spawn / parse / kill / budget)

**Goal.** `ClaudeCodeAdapter` that satisfies the `ProviderAdapter` contract using a spawned `claude` CLI, parses streaming output, kills cleanly on timeout / abort / budget overrun.
**Depends on.** P0.S2, P0.S3 (events table), P1.S1 (mock).

### Tasks
1. T1 — `core/providers/claude-code/spawn.ts` — `spawnClaudeCli(opts)` resolving to `{ child, events: AsyncIterable }` → verify: mock fixture replay produces the expected event stream.
2. T2 — `core/providers/claude-code/parse.ts` — translate Claude Code's structured stream into Beaver's `AgentEvent` types → verify: 100% of fixture events translate without "unknown" type.
3. T3 — Wall-clock timeout via `AbortController` + child kill on signal → verify: forced 1-second timeout fires for a deliberately slow fixture.
4. T4 — Per-agent USD budget tracking. Convert each `usage` event to USD via the rate table; abort with `budget_exceeded` when cap reached → verify: bug test below.
5. T5 — `RunResult` finalization (status, summary, artifacts, usage, transcript path) → verify: schema parse passes.

### Spaghetti test
- Spawn / parse / kill are three files; no single file handles all three.
- No imports from `core/orchestrator/` (provider layer is below orchestrator per layering rule).
- Event translation is a `switch` on a discriminated union; no string-typing of event kinds.

### Bug test
- Mock fixture with normal completion → `RunResult.status = 'ok'`.
- Mock fixture that exceeds budget after 3 turns → status `budget_exceeded`, child killed, event log shows abort reason.
- Hard timeout (1 s on a 5-s fixture) → status `timeout`, no zombie process (verify with `ps`).

### Code review checklist
- All child-process error handling has a `kill('SIGTERM')` then `SIGKILL` fallback after 2 s.
- Transcripts written under `<agent worktree>/.beaver-transcript.jsonl` exist and are valid NDJSON.
- No raw `console.log` in adapter — all output goes through structured events.

---

## Sprint 1.3: PreToolUse hook + policy wiring

**Goal.** Claude Code hook script that asks the sandbox engine before every tool call, writing checkpoints for require-confirmation and emitting events for hard-deny.
**Depends on.** P0.S3 (DAO), P0.S4 (classifier), P1.S2.

### Tasks
1. T1 — `core/providers/claude-code/hook.ts` — small Node script Claude Code spawns as `PreToolUse` hook. Reads tool call from stdin, calls `classify`, writes to SQLite when needed, returns allow/deny → verify: smoke run with a hard-deny pattern fails the tool call.
2. T2 — Hook installation: when `ClaudeCodeAdapter.run()` spawns the CLI, register the hook via the appropriate Claude Code config. Idempotent across runs → verify: second install does not duplicate config entries.
3. T3 — `require-confirmation` flow: hook writes checkpoint row, polls until `answered`, returns based on response → verify: bug test below.
4. T4 — `agent.shell.denied` and `agent.shell.classify` events written for every classified call → verify: events present in DB after a 5-call fixture.

### Spaghetti test
- Hook script depends only on `core/sandbox/classify` and `core/workspace/db`; no transitive pulls into provider code (verified by `madge`).
- Hook returns a single exit code; no shared state with the parent adapter beyond the SQLite file.

### Bug test
- `rm -rf /` proposed → hook denies, run terminates with `policy-violation`.
- `npm install <unfamiliar>` proposed → checkpoint row created, hook waits; manual UPDATE answering "approve" lets the call proceed; UPDATE answering "reject" causes the tool call to fail with the recorded reason.
- 100 allowed shell calls in sequence → hook latency p95 < 50 ms.

### Code review checklist
- Hook script < 150 lines.
- Polling loop has a 500 ms sleep, not busy-loop.
- Hook errors (DB unreachable, etc.) fall back to **deny** — fail closed, never fail open.

---

## Sprint 1.4: CodexAdapter + PATH shim

**Goal.** `CodexAdapter` for the `coder` role (and the deferred `integrator` role later), with a PATH-shim variant of the same sandbox enforcement (since Codex lacks an equivalent PreToolUse hook).
**Depends on.** P1.S2, P1.S3.

### Tasks
1. T1 — `core/providers/codex/spawn.ts`, `parse.ts` — same shape as Claude Code adapter → verify: smoke with a Codex fixture.
2. T2 — `core/providers/codex/shim/` — wrapper scripts for `rm`, `curl`, `wget`, `npm`, `pip`, `sudo`, `git`. Each exec's the real binary after `classify` returns allow → verify: shim wrapping `rm -rf /` blocks the call.
3. T3 — Adapter prepends `<worktree>/.beaver/shim/` to `PATH` for the spawned Codex process → verify: agent's `which rm` resolves to the shim.
4. T4 — Document the bypass surface (absolute paths, `system()` calls) in code comments and link to v0.2 OS-sandbox roadmap → verify: comment present in `shim/README.md`.
5. T5 — Filesystem audit after each Codex agent run detects writes outside the worktree and emits `agent.shell.bypass-attempt` before the run can be approved → verify: audit fixture creates an outside-worktree marker and records the event.

### Spaghetti test
- Shim scripts are one file per command, ≤ 30 lines each.
- Shim does not import TypeScript — it shells out to the same `classify` binary that `core/sandbox` exposes (avoids double TS compile cost in shim runtime).

### Bug test
- `rm -rf /` via shim PATH → blocked with `policy-violation`.
- `/bin/rm -rf /tmp/x` via absolute path → not blocked by PATH shim (acknowledged limitation), post-run audit records the bypass attempt.
- 100 sequential allowed calls via shim → adds < 100 ms total overhead (shell wrapper cost).

### Code review checklist
- Shim scripts use `set -euo pipefail` and `exec` to avoid leaving a parent shell.
- The bypass-attempt event is generated post-hoc by a filesystem audit at run end (not by the shim itself, which can't see absolute paths).
- No platform-specific code paths in v0.1 (Windows shimming deferred).
