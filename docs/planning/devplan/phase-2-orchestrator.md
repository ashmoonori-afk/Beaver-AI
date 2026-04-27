# Phase 2 — Orchestrator

> Agent runtime, baseline rendering (CLAUDE.md / AGENTS.md), the deterministic FSM, LLM sub-decisions, and the single-task happy path. Closes the headless loop end-to-end.

**Doc type:** planning
**Status:** Draft
**Last updated:** 2026-04-26
**See also:** [README.md](README.md), [conventions.md](conventions.md), [../../architecture/orchestrator.md](../../architecture/orchestrator.md), [../../architecture/agent-runtime.md](../../architecture/agent-runtime.md), [../../models/agent-baseline.md](../../models/agent-baseline.md), [../../models/agent-operations.md](../../models/agent-operations.md)

---

## Phase goal

A run started programmatically (via the library API) goes from goal → plan-v1 → coder → reviewer → summarizer → FINAL_REVIEW_PENDING → COMPLETED after final-review approval, with all events persisted, all budgets respected, and the stall watchdog active. No CLI or web UI yet.

## Phase exit criteria

- The library API `await beaver.run({ goal })` resolves with `RunResult` for a small worked example without crashing.
- Plan, decisions, and events all match the documented schemas.
- A stall (forced output silence) triggers `RunResult.status = 'timeout'` and counts as a retry.
- A `policy-violation` from the sandbox engine aborts the run cleanly.

---

## Sprint 2.1: Agent runtime — worktree, lifecycle, stall watchdog

**Goal.** Spawn an agent into a fresh git worktree, supervise it, kill on wall-clock or 120 s output stall, persist transcript and final result.
**Depends on.** P0.S3, P1.S2, P1.S4.

### Tasks
1. T1 — `core/agent-runtime/worktree.ts`: create / remove worktree with branch `beaver/<run>/<agent>` → verify: leftover worktree from a killed test is cleanable by `git worktree prune`.
2. T2 — `core/agent-runtime/lifecycle.ts`: `spawn`, `supervise`, `tearDown`. Tracks `lastOutputTs` from every event → verify: bug test below.
3. T3 — Wall-clock timer per role (defaults from D10 table) → verify: forced 1-s timeout fires.
4. T4 — Stall watchdog: 10 s tick, kill on `now - lastOutputTs > 120_000` → verify: bug test.
5. T5 — Append-only event writes via the DAO → verify: events table has an `agent.spawned`, `agent.completed` row per run.

### Spaghetti test
- Worktree management is its own file; lifecycle does not call `git` directly.
- Supervisor never owns business decisions (verdict, retry count) — it just produces a `RunResult`.
- Stall watchdog has a single setTimeout/Interval; not one per agent.

### Bug test
- Agent that intentionally never emits stdout for 130 s → killed with `timeout` status; events show `agent.stalled`.
- Agent that completes in 1 s with normal output → `tearDown` removes nothing (worktree retained for review).
- Killing the supervisor mid-run → no zombie child after 5 s.

### Code review checklist
- Lifecycle code uses `try { ... } finally { ensureCleanup() }` — no kill paths that leak processes.
- All timers cleared on tear-down; verified by leak detector in tests.
- No `process.exit()` calls from runtime code.

---

## Sprint 2.2: Baseline + repo CLAUDE.md/AGENTS.md merge

**Goal.** Render the agent system prompt by concatenating bundled baseline → user override (if any) → repo CLAUDE.md / AGENTS.md (additive) → role addendum → task prompt. Provider-specific filename (D15).
**Depends on.** P0.S2, P1.S2, P1.S4.

### Tasks
1. T1 — bundle `packages/core/agent-baseline/AGENT_BASELINE.md` and `role/<role>.md` files at build time → verify: the bundled string equals the source on disk.
2. T2 — `core/agent-baseline/render.ts`: `renderSystemPrompt({ provider, role, repoRoot, userConfigDir, taskPrompt })` → verify: snapshot tests for each role × each provider.
3. T3 — Repo discovery: read `<repoRoot>/CLAUDE.md` and `<repoRoot>/AGENTS.md` if present, append additively under headers → verify: bug test.
4. T4 — Write the rendered file as `CLAUDE.md` (Claude Code) or `AGENTS.md` (Codex) into the agent's worktree before spawn → verify: worktree contains correct file with merged content.

### Spaghetti test
- Render is a pure function over a `RenderInput` value; tests do not need fs.
- Role addenda are loaded from disk at startup, not inlined in code, so user-level override (deferred but path reserved) is straightforward later.

### Bug test
- Repo with no `CLAUDE.md` / `AGENTS.md` → output is baseline + role + task only.
- Repo with both files → both appear under named headers, neither replaces the other.
- Spawning Codex agent in a repo that has only `CLAUDE.md` → Codex reads `AGENTS.md` (rendered with the same merged content).

### Code review checklist
- Concatenation produces clear `## ` headers between layers; no silent paragraph merge.
- Rendered file ends with a single trailing newline, not multiple.
- `render.ts` is < 150 lines.

---

## Sprint 2.3: Orchestrator FSM

**Goal.** The deterministic top-level state machine: INITIALIZED → PLANNING → EXECUTING → REVIEWING → FINAL_REVIEW_PENDING → COMPLETED, with checkpoint emission at the documented boundaries. INTEGRATING is the target-model state for v0.2+ multi-task runs.
**Depends on.** P0.S3, P2.S1, P2.S2.

### Tasks
1. T1 — `core/orchestrator/fsm.ts`: state enum, transition function `(state, event) → next`, terminal-state set → verify: invalid transitions throw with the from/to pair.
2. T2 — `core/orchestrator/loop.ts`: drives the FSM by dispatching agent runs and collecting results. Single-task path only in this sprint → verify: an empty plan transitions PLANNING → FINAL_REVIEW_PENDING, then COMPLETED after approval.
3. T3 — Plan persistence: each plan version written to `runs/<run-id>/plan/plan-v<N>.json` referenced by the `plans` table → verify: lineage retrievable.
4. T4 — Checkpoint emission at PLANNING (plan-approval), EXECUTING (budget-exceeded if hit), REVIEWING (escalation if retries exhausted) — body content stubbed for now → verify: checkpoint rows present at expected boundaries.

### Spaghetti test
- FSM is plain TS data; no LLM calls and no I/O inside the transition function.
- The loop file orchestrates but does not contain transition logic (single source of truth).
- No `if (state === 'X') { /* large block */ }` cascades — each state has a small handler function.

### Bug test
- Single-task plan with no `dependsOn` → run completes; `runs.status = 'COMPLETED'` after final-review approve.
- Forced bad transition (e.g., trying to enter REVIEWING from INITIALIZED) → throws.
- Crash mid-EXECUTING → `events` shows the last transition; on resume, FSM rebuilds and restarts the partial agent.

### Code review checklist
- Transition function is exhaustive over state × event; TS compiler enforces with discriminated unions.
- `loop.ts` < 250 lines.
- Every `await` inside the loop is paired with a corresponding `events` row written first or after — no silent state changes.

---

## Sprint 2.4: LLM sub-decisions

**Goal.** Each documented sub-decision (plan refine, pick next task, accept/retry/escalate, conflict resolution, satisfied check) implemented as a Claude Code CLI call with zod-validated output.
**Depends on.** P1.S2, P2.S3.

### Tasks
1. T1 — `core/orchestrator/decisions/index.ts` — one async function per sub-decision returning typed `Decision<T>` → verify: example call resolves to typed object.
2. T2 — Prompts in `core/orchestrator/decisions/prompts/<name>.md` (loaded at runtime) → verify: snapshot of compiled prompts.
3. T3 — Validation failure: retry once with schema-rehearsal prompt, then escalate → verify: bug test.
4. T4 — Cost tracking per call, tagged `source = 'sub-decision'` → verify: rows present in `costs`.

### Spaghetti test
- One file per sub-decision; flat registry map, no nested logic.
- No general "askLLM" abstraction — each decision has its own typed function.
- Prompts contain only markdown with placeholders, not JS interpolation.

### Bug test
- Invalid JSON twice from mock → run posts `escalation` with reason `sub-decision-validation-failed`.
- Sub-decision retry budget independent of D10 task retry budget.
- 429 → exponential backoff inside adapter, no task-retry count.

### Code review checklist
- Each prompt < 50 lines.
- Output schemas minimal (only what orchestrator consumes).
- No `confidence` magic numbers — confidence not surfaced in v0.1.

---

## Sprint 2.5: Single-task happy path end-to-end

**Goal.** Library `beaver.run({ goal })` runs a single-task plan through planner → coder → reviewer → summarizer with real Claude Code + Codex.
**Depends on.** P2.S1–S4.

### Tasks
1. T1 — `packages/beaver-ai/src/api.ts` exporting `Beaver`, `run()` → verify: fixture run.
2. T2 — Reference fixture `examples/hello-world/` for "create hello.txt containing 'hello'" → verify: run completes, file in the agent's branch.
3. T3 — Summarizer writes `final-report.md` → verify: ≥ 1 paragraph.
4. T4 — `beaver.resume(runId)` after mid-run kill → verify: continues from last event.

### Spaghetti test
- Library entry < 100 lines, only wires P0–P2 modules.
- No CLI or server imports here.

### Bug test
- Happy path COMPLETED with non-zero cost recorded.
- Planner asked for `rm -rf /` aborts with `policy-violation`, no commits.
- Resume after kill within 5 s.

### Code review checklist
- Fixture lives under `examples/`, not test-only paths.
- Library API has zero deps on Fastify / Vite / UI packages.
